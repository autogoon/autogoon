// Time a set of candidate models against real conversations.
//
//   npm run llm:benchmark              every conversation in llm-benchmark/
//   npm run llm:benchmark elise        only those whose filename contains it
//   npm run llm:benchmark:wipe         throw the measurements away, send nothing
//
// A conversation in llm-benchmark/ is a request copied out of the app's Debug
// tab, so a run asks a model for the next turn of a real one. Three runs per
// model per conversation, timed to the first token, to the first token of the
// reply, and to the last. They print in the order they were made: the first call
// to a provider is the cold one.
//
// Measurements are stored per conversation and model in llm-benchmark/results/,
// and reused, so adding a model pays for that model alone. Rows read back are
// marked `cached` — they were timed on another day, under another load. `wipe`
// throws them away.
//
// A paid path: three generations per unmeasured pair, each carrying a whole
// conversation. It says what it is about to spend before starting, and writes
// each pair as it finishes, so ^C keeps what it paid for.
//
// It does not judge a reply. Every one is written out in full and its first
// line printed; reading them is the job.
//
// Reads OPENROUTER_API_KEY / LLM_URL from the environment.

import process from 'node:process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { out } from './lib/colour';

// The candidates. Edit this list; it is the point of the script.
//
// Sorted, which is the order the per-conversation tables print in. The summary
// at the end is ordered by mean total instead.
const MODELS = [
  'deepseek/deepseek-v4-flash:nitro',
  'deepseek/deepseek-v4-pro:nitro',
  'meituan/longcat-2.0:nitro',
  'meta-llama/llama-4-maverick:nitro',
  'mistralai/mistral-small-2603:nitro',
  'moonshotai/kimi-k2.6:nitro',
  'nex-agi/nex-n2-mini:nitro',
  'qwen/qwen3-30b-a3b-instruct-2507:nitro',
  'qwen/qwen3.7-plus:nitro',
  'qwen/qwen3.8-max:nitro',
  'stepfun/step-3.7-flash:nitro',
  'tencent/hy3:nitro',
  'x-ai/grok-4.3:nitro',
  'xiaomi/mimo-v2.5:nitro',
  'z-ai/glm-4.7-flash:nitro',
  'z-ai/glm-5.2:nitro',
];

// Hand-written notes on what a run cannot measure: how a model behaved when the
// app used it, and why a model absent from MODELS was taken out. Printed under
// the summary, so a model that times well and plays badly says so in the same
// output.
const NOTES: Record<string, string> = {
  'nex-agi/nex-n2-mini:nitro':
    'Quick, very cheap, and good on the whole. During testing it was shown to take parts of a prompt too literally, and to have trouble with tool calls — most visibly search_media and then send_media, where it searches, reads the matches back and never sends one. It is hard to engineer the prompt perfectly for some personas, so a more capable model may be the safer default; for others it is ideal.',
  'qwen/qwen3-30b-a3b-instruct-2507:nitro':
    'Speaks example lines out of the system prompt verbatim as its own dialogue, and talks about sending a picture without calling the tool that sends one.',
  'inclusionai/ling-2.6-flash:nitro':
    'Out of the list: 429 from upstream too often to measure, three runs against one conversation coming back rate-limited every time.',
  'qwen/qwen3.7-flash:nitro':
    'Out of the list: 429 from upstream on 11 of 12 runs.',
  'minimax/*':
    'Out of the list: the app cannot use any of them. Every system message after the first is concatenated onto the leading one, so the clock, the toy state and the ambient cue arrive ahead of the conversation instead of as the last thing said; and reasoning is streamed inside content as a <think> block rather than in reasoning_details, so it is spoken aloud and stored as dialogue. Measured on 3 August 2026 against minimax-m2.5 (Parasail) and minimax-m3 (AtlasCloud), so it is the model and not one host.',
};

const RUNS = 3;
// How many models are measured at once. A model's own conversations and runs
// stay in sequence whatever this is, since the three timings only show a warm-up
// while they follow each other. Capped across models because a machine holding
// every stream open times its own contention too.
const CONCURRENCY = 6;
const DIR = 'llm-benchmark';
const RESULTS_DIR = 'llm-benchmark/results';
// Long enough for a whole turn on a slow provider, short enough that one
// hanging model doesn't hold up the rest of the run.
const TIMEOUT_MS = 120_000;

// The app's message shape, as the copy button writes it. Only the fields a
// request carries are read; anything else in the file is ignored.
type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoningDetails?: unknown[];
  toolCalls?: { id: string; name: string; arguments: string }[];
  toolCallId?: string;
};

type WireMessage = {
  role: string;
  content: string;
  reasoning_details?: unknown[];
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

// One generation's measurements. `error` set means the rest is meaningless.
type Run = {
  firstTokenMs: number | null;
  firstReplyTokenMs: number | null;
  totalMs: number;
  reply: string;
  // Where the model put its thinking: the reasoning_details channel, or inside
  // the content as a <think> block (which the app would speak aloud).
  reasoning: 'none' | 'reasoning_details' | 'in-content';
  toolCalls: string[];
  finishReason: string | null;
  provider: string | null;
  outputTokens: number | null;
  costUsd: number | null;
  error: string | null;
};

function toWire(m: Message): WireMessage {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
  }
  const out: WireMessage = { role: m.role, content: m.content };
  if (m.role === 'assistant') {
    if (m.reasoningDetails !== undefined) {
      out.reasoning_details = m.reasoningDetails;
    }
    if (m.toolCalls !== undefined && m.toolCalls.length > 0) {
      out.tool_calls = m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
      }));
    }
  }
  return out;
}

// Tool declarations built from the names the conversation already calls: some
// providers reject a transcript replaying tool calls with none declared, so
// every name used gets a stub with open parameters. The app's real descriptions
// live in the panel and can't be imported here, so this measures nothing about
// a model's tool-calling.
function toolsFrom(messages: Message[]): unknown[] {
  const names = new Set<string>();
  for (const m of messages) {
    for (const c of m.toolCalls ?? []) names.add(c.name);
  }
  return [...names].map((name) => ({
    type: 'function',
    function: {
      name,
      description: `The ${name} tool, as this conversation used it.`,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    },
  }));
}

// One streamed generation, timed. Never throws — a failure comes back as a Run
// carrying `error`, so one dead model doesn't end the benchmark.
async function runOnce(
  model: string,
  messages: Message[],
  apiKey: string,
  baseUrl: string,
): Promise<Run> {
  const run: Run = {
    firstTokenMs: null,
    firstReplyTokenMs: null,
    totalMs: 0,
    reply: '',
    reasoning: 'none',
    toolCalls: [],
    finishReason: null,
    provider: null,
    outputTokens: null,
    costUsd: null,
    error: null,
  };
  const startedAt = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      signal: abort.signal,
      body: JSON.stringify({
        model,
        stream: true,
        // The usage block in the final chunk carries the provider and price.
        stream_options: { include_usage: true },
        usage: { include: true },
        messages: messages.map(toWire),
        tools: toolsFrom(messages),
      }),
    });
    if (!res.ok || res.body === null) {
      const body = await res.text().catch(() => '');
      run.error = `HTTP ${res.status} ${body.slice(0, 200)}`;
      run.totalMs = Date.now() - startedAt;
      return run;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let reasoningText = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      // SSE frames are blank-line separated; a partial one stays buffered.
      const frames = buffered.split('\n\n');
      buffered = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame
          .split('\n')
          .find((l) => l.startsWith('data: '))
          ?.slice(6);
        if (line === undefined || line === '[DONE]') continue;
        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue; // a comment or keep-alive, not a chunk
        }
        const choice = (
          chunk.choices as
            | {
                delta?: {
                  content?: string;
                  reasoning?: string;
                  reasoning_details?: unknown[];
                  tool_calls?: { function?: { name?: string } }[];
                };
                finish_reason?: string;
              }[]
            | undefined
        )?.[0];
        const usage = chunk.usage as
          { completion_tokens?: number; cost?: number } | undefined;
        if (typeof chunk.provider === 'string') run.provider = chunk.provider;
        if (usage !== undefined) {
          run.outputTokens = usage.completion_tokens ?? run.outputTokens;
          run.costUsd = usage.cost ?? run.costUsd;
        }
        if (choice?.finish_reason != null) {
          run.finishReason = choice.finish_reason;
        }
        const delta = choice?.delta;
        if (delta === undefined) continue;
        const thought =
          (delta.reasoning ?? '') !== '' ||
          (delta.reasoning_details ?? []).length > 0;
        const spoke = (delta.content ?? '') !== '';
        if (run.firstTokenMs === null && (thought || spoke)) {
          run.firstTokenMs = Date.now() - startedAt;
        }
        if (thought) {
          run.reasoning = 'reasoning_details';
          reasoningText += delta.reasoning ?? '';
        }
        for (const c of delta.tool_calls ?? []) {
          const name = c.function?.name;
          if (name !== undefined && !run.toolCalls.includes(name)) {
            run.toolCalls.push(name);
          }
        }
        if (spoke) {
          if (run.firstReplyTokenMs === null) {
            run.firstReplyTokenMs = Date.now() - startedAt;
          }
          run.reply += delta.content ?? '';
        }
      }
    }
    run.totalMs = Date.now() - startedAt;
    // Thinking written into the reply rather than sent as reasoning: the app
    // would speak this aloud and store it as something the companion said.
    if (run.reply.includes('<think>')) run.reasoning = 'in-content';
    else if (run.reasoning === 'none' && reasoningText !== '') {
      run.reasoning = 'reasoning_details';
    }
    return run;
  } catch (e) {
    run.totalMs = Date.now() - startedAt;
    run.error =
      abort.signal.aborted && !(e instanceof Error && e.name === 'TypeError')
        ? `timed out after ${TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : String(e);
    return run;
  } finally {
    clearTimeout(timer);
  }
}

// The mean of what came back, ignoring the runs that failed.
function meanOf(values: (number | null)[]): number | null {
  const got = values.filter((v): v is number => v !== null);
  if (got.length === 0) return null;
  return Math.round(got.reduce((a, b) => a + b, 0) / got.length);
}

const secs = (ms: number | null): string =>
  ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`;

// Colour is for reading a column at a glance. The codes are named rather than
// applied here because a cell's colour is decided by where its number ranks, so
// it travels as a value; lib/colour decides whether anything is emitted at all.
const CYAN = '36';
const WHITE = '97';
// Text out of the conversation rather than a measurement, and the second and
// third places in a table's ranking.
const YELLOW = '33';
const GREEN = '32';
const RED = '31';
const { paint } = out;

// One row's runs, unsorted, so where the green and red land says whether the
// provider warmed up. Padded before painting: escape codes have no width, and
// padding after would push every later column out by their length.
function inOrder(values: (number | null)[]): string {
  const got = values.filter((v): v is number => v !== null);
  const best = got.length > 1 ? Math.min(...got) : null;
  const worst = got.length > 1 ? Math.max(...got) : null;
  return values
    .map((v) => {
      const text = secs(v).padStart(6);
      if (v === null || best === worst) return text;
      if (v === best) return paint(GREEN, text);
      if (v === worst) return paint(RED, text);
      return text;
    })
    .join('/');
}

// Where each value stands against the rest of its column: green on the lowest,
// yellow on the next two, red on the highest. Placed on distinct values, so rows
// that tie take the same colour rather than one being pushed down a place.
function placings(values: (number | null)[]): (string | null)[] {
  const got = values.filter((v): v is number => v !== null);
  const ranked = [...new Set(got)].sort((a, b) => a - b);
  if (got.length < 2 || ranked.length < 2) return values.map(() => null);
  const worst = ranked[ranked.length - 1];
  return values.map((v) => {
    if (v === null) return null;
    // Worst first: in a three-place column it is also one of the top three, and
    // being last is the thing worth seeing.
    if (v === worst) return RED;
    if (v === ranked[0]) return GREEN;
    return v === ranked[1] || v === ranked[2] ? YELLOW : null;
  });
}

// The same, for the word labelling a group of runs.
const byMean = (rows: (number | null)[][]): (string | null)[] =>
  placings(rows.map(meanOf));

const label = (word: string, colour: string | null): string =>
  colour === null ? word : paint(colour, word);

// Greedy word wrap, for the notes under the summary. A word longer than the
// width goes on its own line rather than being broken.
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line === '') line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

// The same placing, for money. Five decimal places because one generation on a
// cheap model costs about a tenth of a cent. A model that reported no price is
// dashed, not zeroed — zero would take the green as the cheapest here.
function costColumn(values: (number | null)[], width: number): string[] {
  const colours = placings(values);
  return values.map((v, i) => {
    const text = (v === null ? '—' : `$${v.toFixed(5)}`).padStart(width);
    const colour = colours[i];
    return colour === undefined || colour === null ? text : paint(colour, text);
  });
}

// The reply's first line. An empty reply is usually a turn spent on a tool call,
// so it names the call: in a transcript the two look alike and mean opposite
// things about whether the model answered.
const firstLine = (run: Run | undefined): string => {
  if (run === undefined) return '(no run)';
  if (run.error !== null) return `ERROR ${run.error}`;
  const line = run.reply.trim().split('\n')[0] ?? '';
  if (line !== '') return line.length > 90 ? `${line.slice(0, 89)}…` : line;
  return run.toolCalls.length > 0
    ? `(no words — called ${run.toolCalls.join(', ')})`
    : '(empty)';
};

type Result = {
  model: string;
  conversation: string;
  runs: Run[];
  cached: boolean;
};

// One conversation's measurements, the file under RESULTS_DIR. `sourceHash` is
// the conversation as it was when they were made: edit it and every model's
// entry is stale, since a table mixing models measured against different inputs
// compares nothing.
type Store = {
  conversation: string;
  sourceHash: string;
  models: Record<string, { at: string; runs: Run[] }>;
};

const storePath = (conversation: string): string =>
  join(RESULTS_DIR, `${conversation}.json`);

const hashOf = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');

// What was measured for one conversation, or an empty store: no file,
// unreadable, or written against a different version of it. Unreadable counts as
// absent, costing a re-measure where stopping would cost the whole run.
async function readStore(
  conversation: string,
  sourceHash: string,
): Promise<Store> {
  const empty: Store = { conversation, sourceHash, models: {} };
  const raw = await readFile(storePath(conversation), 'utf8').catch(() => null);
  if (raw === null) return empty;
  let parsed: Store;
  try {
    parsed = JSON.parse(raw) as Store;
  } catch {
    return empty;
  }
  if (parsed.sourceHash !== sourceHash || typeof parsed.models !== 'object') {
    return empty;
  }
  return { conversation, sourceHash, models: parsed.models };
}

// A stored entry stands in for a fresh one only if it holds the runs this
// invocation would make and every one answered. A 429 is how the provider
// behaved that minute, not a measurement; kept, it would pin a model as failed
// for good.
const usable = (entry: { runs: Run[] } | undefined): boolean =>
  entry !== undefined &&
  entry.runs.length === RUNS &&
  entry.runs.every((r) => r.error === null);

// Written after each model finishes, so ^C keeps what it has paid for. Two
// models can finish the same conversation at once, and two overlapping writes to
// one path interleave into a file that parses as neither — so each
// conversation's writes are chained.
const writeQueue = new Map<string, Promise<void>>();
function writeStore(store: Store): Promise<void> {
  const next = (writeQueue.get(store.conversation) ?? Promise.resolve()).then(
    async () => {
      await mkdir(RESULTS_DIR, { recursive: true });
      await writeFile(
        storePath(store.conversation),
        JSON.stringify(store, null, 2),
      );
    },
  );
  writeQueue.set(store.conversation, next);
  return next;
}

// One run's timing, or null where it failed. A failed run still has a totalMs,
// but it timed a refusal — left in, a model that 429s three times takes the
// green as the quickest.
const timings = (
  runs: Run[],
  of: (r: Run) => number | null,
): (number | null)[] => runs.map((r) => (r.error === null ? of(r) : null));

// Where the conversation had got to: the last thing either of them said. The
// system messages after it are the same on every conversation, and a turn spent
// on a tool call carries no words, so both are passed over.
const TAIL_CHARS = 150;
function tailLines(messages: Message[]): string[] {
  const said = messages.filter(
    (m) =>
      (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '',
  );
  const last = said.at(-1);
  if (last === undefined) return [];
  const text = last.content.replace(/\s+/g, ' ').trim();
  return [
    `${last.role}: ${text.length > TAIL_CHARS ? `${text.slice(0, TAIL_CHARS - 1)}…` : text}`,
  ];
}

// Both tables. `tails` carries each conversation's closing messages.
function report(
  models: string[],
  results: Result[],
  tails: Map<string, string[]>,
): void {
  const names = [...new Set(results.map((r) => r.conversation))];
  const width = Math.max(...models.map((m) => m.length));
  const runCount = Math.max(...results.map((r) => r.runs.length));
  const legend = `run ${Array.from({ length: runCount }, (_, i) => i + 1).join('/')}`;

  console.log(`\n── Per conversation (${legend}) ──\n`);
  for (const name of names) {
    const rows = results.filter((r) => r.conversation === name);
    const reply = rows.map((r) => timings(r.runs, (x) => x.firstReplyTokenMs));
    const total = rows.map((r) => timings(r.runs, (x) => x.totalMs));
    const replyColour = byMean(reply);
    const totalColour = byMean(total);
    console.log(paint(CYAN, name));
    for (const line of tails.get(name) ?? [])
      console.log(paint(YELLOW, `  ${line}`));
    rows.forEach((r, i) => {
      const failed = r.runs.filter((x) => x.error !== null).length;
      console.log(
        `  ${paint(WHITE, r.model.padEnd(width))}` +
          `  ${label('reply', replyColour[i] ?? null)} ${inOrder(reply[i]!)}` +
          `  ${label('total', totalColour[i] ?? null)} ${inOrder(total[i]!)}` +
          `${failed > 0 ? `  ${failed}/${r.runs.length} failed` : ''}` +
          `${r.cached ? '  cached' : ''}`,
      );
      const first = r.runs[0];
      const line =
        `    ${first?.reasoning === 'in-content' ? '<think> in content · ' : ''}` +
        firstLine(first);
      // Yellow like the conversation above: words, not timings.
      console.log(paint(first?.error == null ? YELLOW : RED, line));
    });
    console.log('');
  }

  console.log(
    `── Every conversation, by model (${legend}, averaged · $ per generation) ──\n`,
  );
  // Averaged by run index across the conversations rather than over every run
  // flattened together, which would bury the cold first call.
  const perIndex = (
    rows: Result[],
    of: (r: Run) => number | null,
  ): (number | null)[] =>
    Array.from({ length: runCount }, (_, i) =>
      meanOf(
        rows.map((r) =>
          r.runs[i] === undefined ? null : timings(r.runs, of)[i]!,
        ),
      ),
    );
  const perModel = models.map((model) => {
    const rows = results.filter((r) => r.model === model);
    const runs = rows.flatMap((r) => r.runs);
    // What one generation costs, so the column compares models rather than
    // however many runs this invocation made. Averaged over the priced runs: a
    // failed one reports nothing, and counting it as free reads as cheap.
    const priced = runs
      .map((r) => r.costUsd)
      .filter((c): c is number => c !== null);
    return {
      model,
      runs,
      reply: perIndex(rows, (r) => r.firstReplyTokenMs),
      total: perIndex(rows, (r) => r.totalMs),
      cost:
        priced.length === 0
          ? null
          : priced.reduce((a, b) => a + b, 0) / priced.length,
    };
  });
  // Quickest mean total at the top: this table is the ranking. A model that
  // never returned a timing goes to the bottom.
  const ordered = [...perModel].sort((a, b) => {
    const at = meanOf(a.total);
    const bt = meanOf(b.total);
    if (at === null) return bt === null ? 0 : 1;
    if (bt === null) return -1;
    return at - bt;
  });
  const replyColour = byMean(ordered.map((m) => m.reply));
  const totalColour = byMean(ordered.map((m) => m.total));
  const costs = costColumn(
    ordered.map((m) => m.cost),
    8,
  );
  ordered.forEach((m, i) => {
    const failed = m.runs.filter((r) => r.error !== null).length;
    const inContent = m.runs.filter((r) => r.reasoning === 'in-content').length;
    console.log(
      `${paint(WHITE, m.model.padEnd(width))}` +
        `  ${label('reply', replyColour[i] ?? null)} ${inOrder(m.reply)}` +
        `  ${label('total', totalColour[i] ?? null)} ${inOrder(m.total)}` +
        `  ${costs[i]}` +
        `${failed > 0 ? `  ${failed}/${m.runs.length} failed` : ''}` +
        `${inContent > 0 ? `  ${inContent} with <think> in content` : ''}`,
    );
  });

  // The table's own models first, then the rest of NOTES: the ones taken out of
  // MODELS have no row to sit under, and are why this isn't built from the
  // table.
  const noted = [
    ...ordered.map((m) => m.model).filter((m) => NOTES[m] !== undefined),
    ...Object.keys(NOTES).filter((m) => !models.includes(m)),
  ];
  if (noted.length > 0) {
    const notesWidth = Math.max(...noted.map((m) => m.length));
    console.log('\n── Notes ──\n');
    for (const model of noted) {
      // A hanging indent under the model, so a long note doesn't fold back to
      // column zero and read as the next model's.
      const lines = wrap(NOTES[model]!, 100 - notesWidth);
      console.log(`${paint(WHITE, model.padEnd(notesWidth))}  ${lines[0]}`);
      for (const line of lines.slice(1)) {
        console.log(`${' '.repeat(notesWidth)}  ${line}`);
      }
    }
  }
}

// Throw away every measurement. Nothing is sent, so no key is needed.
async function wipe(): Promise<void> {
  const entries = await readdir(RESULTS_DIR).catch(() => []);
  const files = entries.filter((f) => f.endsWith('.json'));
  for (const file of files) await rm(join(RESULTS_DIR, file));
  console.log(
    files.length === 0
      ? `Nothing measured in ${RESULTS_DIR}/.`
      : `Deleted ${files.map((f) => f.replace(/\.json$/, '')).join(', ')}.`,
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === '--wipe') {
    await wipe();
    return;
  }

  // Not checked yet: a fully-measured run sends nothing and prints without one.
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.LLM_URL ?? 'https://openrouter.ai/api/v1';

  const filter = arg;
  let entries: string[];
  try {
    entries = await readdir(DIR);
  } catch {
    console.error(`No ${DIR}/ directory.`);
    process.exitCode = 1;
    return;
  }
  const files = entries
    .filter((f) => f.endsWith('.json'))
    .filter((f) => filter === undefined || f.includes(filter))
    .sort();
  if (files.length === 0) {
    console.error(
      `No conversations in ${DIR}/${filter === undefined ? '' : ` matching "${filter}"`}.` +
        ' Copy a request out of the app\'s Debug tab ("Show request" → Copy) and save it there.',
    );
    process.exitCode = 1;
    return;
  }

  // The hash is of the file as read, so a conversation edited since it was
  // last measured takes its stored entries with it.
  const conversations: { name: string; messages: Message[]; hash: string }[] =
    [];
  for (const file of files) {
    const raw = await readFile(join(DIR, file), 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(
        `${file}: not JSON (${e instanceof Error ? e.message : e})`,
      );
      process.exitCode = 1;
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error(`${file}: expected a non-empty array of messages.`);
      process.exitCode = 1;
      return;
    }
    conversations.push({
      name: file.replace(/\.json$/, ''),
      messages: parsed as Message[],
      hash: hashOf(raw),
    });
  }

  const stores = new Map<string, Store>();
  for (const c of conversations) {
    stores.set(c.name, await readStore(c.name, c.hash));
  }
  const toMeasure = MODELS.flatMap((model) =>
    conversations
      .filter((c) => !usable(stores.get(c.name)?.models[model]))
      .map((c) => ({ model, conversation: c })),
  );
  const fromDisk = MODELS.length * conversations.length - toMeasure.length;

  console.log(
    `${MODELS.length} models × ${conversations.length} conversations: ` +
      `${fromDisk} pairs already measured, ${toMeasure.length} to run ` +
      `= ${toMeasure.length * RUNS} generations, each carrying a whole conversation.`,
  );
  console.log(`Conversations: ${conversations.map((c) => c.name).join(', ')}`);
  if (toMeasure.length > 0) {
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY is not set (see .env.example).');
      process.exitCode = 1;
      return;
    }
    console.log(
      `${CONCURRENCY} at a time — ^C to stop, and what is measured by then is kept.\n`,
    );

    // One queue of models, each carrying its own conversations. Sharing a queue
    // rather than dealing them out keeps every worker busy when one model turns
    // out far slower than the rest.
    const queue = MODELS.map((model) => ({
      model,
      todo: toMeasure.filter((p) => p.model === model),
    })).filter((m) => m.todo.length > 0);

    const worker = async (): Promise<void> => {
      for (;;) {
        const next = queue.shift();
        if (next === undefined) return;
        for (const { conversation } of next.todo) {
          const runs: Run[] = [];
          for (let i = 0; i < RUNS; i++) {
            const run = await runOnce(
              next.model,
              conversation.messages,
              apiKey,
              baseUrl,
            );
            runs.push(run);
            process.stdout.write(
              `${next.model} · ${conversation.name} · run ${i + 1}/${RUNS}: ` +
                `${run.error === null ? `${secs(run.firstReplyTokenMs)} to reply, ${secs(run.totalMs)} total` : run.error}\n`,
            );
          }
          const store = stores.get(conversation.name)!;
          store.models[next.model] = { at: new Date().toISOString(), runs };
          await writeStore(store);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );
  }

  // Every pair, measured now or read back. One that failed this run is still
  // shown, since the errors are the point, and is not marked cached. Keyed as
  // JSON because no single character is guaranteed absent from both a model id
  // and a conversation name.
  const measured = new Set(
    toMeasure.map(({ model, conversation }) =>
      JSON.stringify([model, conversation.name]),
    ),
  );
  const results: Result[] = MODELS.flatMap((model) =>
    conversations.flatMap((c) => {
      const entry = stores.get(c.name)?.models[model];
      if (entry === undefined) return [];
      return [
        {
          model,
          conversation: c.name,
          runs: entry.runs,
          cached: !measured.has(JSON.stringify([model, c.name])),
        },
      ];
    }),
  );

  report(
    MODELS,
    results,
    new Map(conversations.map((c) => [c.name, tailLines(c.messages)])),
  );

  console.log(
    `\nEvery reply in full: ${RESULTS_DIR}/, one file per conversation.`,
  );
  console.log('Read them again without spending: npm run llm:benchmark');
  console.log('Throw them away: npm run llm:benchmark:wipe');
}

await main();
