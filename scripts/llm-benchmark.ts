// Time a set of candidate models against real conversations.
//
//   npm run llm:benchmark              every conversation in llm-benchmark/
//   npm run llm:benchmark elise        only those whose filename contains it
//   npm run llm:benchmark <file>       re-print a saved run, sending nothing
//
// Conversations sit in llm-benchmark/, and what a run measured is written to
// llm-benchmark/results/.
//
// A conversation is a request copied out of the app — the Debug tab's request
// viewer, Copy — so it is the app's own LlmMessage shape, ending on the
// live-state system message. One run asks a model to produce the next turn from
// it, which is exactly what the app asks for.
//
// What it measures, three runs per model per conversation: time to the first
// token, time to the first token of the reply itself (a thinking model spends
// the gap between them reasoning, and only the reply is spoken), and the time to
// the last. The three are printed in the order they were run, never sorted:
// the first call to a provider is the cold one, and whether it warms up is only
// visible while the runs are still in sequence.
//
// It does not judge whether a reply is a refusal. Every reply is written out in
// full and its first line printed, and reading them is the job for now.
//
// This is a paid path: runs = models × conversations × 3, each carrying a whole
// conversation as prompt. It prints what it is about to spend the money on and
// waits a beat before starting.
//
// Reads OPENROUTER_API_KEY / LLM_URL from the environment; the npm script loads
// .env via --env-file-if-exists.

import process from 'node:process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The candidates. Edit this list — it is the point of the script.
const MODELS = [
  'xiaomi/mimo-v2.5:nitro',
  'meta-llama/llama-4-maverick:nitro',
  'qwen/qwen3-30b-a3b-instruct-2507:nitro',
  'deepseek/deepseek-v4-flash:nitro',
  'z-ai/glm-4.7-flash:nitro',
  'inclusionai/ling-2.6-flash:nitro',
];

const RUNS = 3;
// Conversations sit here; every run's results go in the subdirectory, so the
// two never have to be told apart by name.
const DIR = 'llm-benchmark';
const RESULTS_DIR = 'llm-benchmark/results';
const RESULTS_PREFIX = 'results-';
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

// Tool declarations built from the names the conversation already calls. The
// app's own descriptions live in the panel that declares them and can't be
// imported into a script, and a transcript replaying tool calls with no tools
// declared is rejected by some providers — so every name used gets a stub with
// open parameters. It is enough to make the request valid; it is not what the
// app sends, so a model's tool-calling is not what this measures.
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

// One streamed generation, timed. Never throws: a transport failure, a non-200
// or a timeout comes back as a Run carrying `error`, so one dead model doesn't
// end the benchmark.
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
        // Asks OpenRouter for the usage block in the final chunk, which is
        // where the provider and the price of this run come from.
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

// Colour is for reading a column at a glance, so it goes off the moment the
// output is not a terminal — a redirect into a file, or a pipe into grep, keeps
// the escape codes out of it. NO_COLOR is the usual opt-out.
const COLOUR =
  process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
const CYAN = '36';
const WHITE = '97';
// Everything that is text out of the conversation rather than a measurement.
const YELLOW = '33';
const GREEN = '32';
const RED = '31';
const paint = (code: string, text: string): string =>
  COLOUR ? `[${code}m${text}[0m` : text;

// One row's runs, in the order they were made — the first is the cold one, and
// that is the whole reason they aren't sorted. Green on the quickest, red on
// the slowest, so where the colours land says whether the provider warmed up.
// Padded before painting: the escape codes have no width, and padding after
// would push every later column out by their length. A row whose runs all took
// the same time, or which has only one that answered, is left plain.
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

// A colour per row, from the means, for the word that labels the group: green
// on the model with the lowest mean in this table and red on the highest. The
// figures say how one model behaved run to run; the label says where it stands
// against the others. Every row the same, or only one row with a mean at all,
// leaves the labels plain — there is no comparison to draw.
function byMean(rows: (number | null)[][]): (string | null)[] {
  const means = rows.map(meanOf);
  const got = means.filter((m): m is number => m !== null);
  if (got.length < 2) return means.map(() => null);
  const best = Math.min(...got);
  const worst = Math.max(...got);
  if (best === worst) return means.map(() => null);
  return means.map((m) =>
    m === null ? null : m === best ? GREEN : m === worst ? RED : null,
  );
}

const label = (word: string, colour: string | null): string =>
  colour === null ? word : paint(colour, word);

// The same, for money rather than time.
function costColumn(values: number[], width: number): string[] {
  const best = values.length > 1 ? Math.min(...values) : null;
  const worst = values.length > 1 ? Math.max(...values) : null;
  return values.map((v) => {
    const text = `$${v.toFixed(4)}`.padStart(width);
    if (best === worst) return text;
    if (v === best) return paint(GREEN, text);
    if (v === worst) return paint(RED, text);
    return text;
  });
}

// The reply's first line, for reading down a column. A reply with nothing in it
// is usually a turn the model spent on a tool call, so it says which rather
// than "(empty)" — the two look identical in a transcript and mean opposite
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

type Result = { model: string; conversation: string; runs: Run[] };

// One run's timing, or null where it failed — a failed run still has a totalMs,
// but it is how long the refusal to serve took, and left in, a model that 429s
// three times straight away takes the green as the quickest.
const timings = (
  runs: Run[],
  of: (r: Run) => number | null,
): (number | null)[] => runs.map((r) => (r.error === null ? of(r) : null));

// Where the conversation had got to, for the table below it: the last thing
// either of them actually said. The system messages that follow it — the clock,
// the toy, the quiet-beat cue — are the same on every conversation and say
// nothing about what a model is being asked to continue. A turn spent on a tool
// call carries no words, so it is passed over for the one that does.
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

// Both tables, from results either just measured or read back off disk. `tails`
// carries each conversation's closing messages, where they could be found.
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
          `${failed > 0 ? `  ${failed}/${r.runs.length} failed` : ''}`,
      );
      const first = r.runs[0];
      const line =
        `    ${first?.reasoning === 'in-content' ? '<think> in content · ' : ''}` +
        firstLine(first);
      // Yellow like the conversation above it, since it is the same thing —
      // words, not timings. A run that failed says so in red instead.
      console.log(paint(first?.error == null ? YELLOW : RED, line));
    });
    console.log('');
  }

  console.log(`── Every conversation, by model (${legend}, averaged) ──\n`);
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
    return {
      model,
      runs,
      reply: perIndex(rows, (r) => r.firstReplyTokenMs),
      total: perIndex(rows, (r) => r.totalMs),
      cost: runs.reduce((a, r) => a + (r.costUsd ?? 0), 0),
    };
  });
  const replyColour = byMean(perModel.map((m) => m.reply));
  const totalColour = byMean(perModel.map((m) => m.total));
  const costs = costColumn(
    perModel.map((m) => m.cost),
    7,
  );
  perModel.forEach((m, i) => {
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
}

// Re-print a results file. Nothing is sent, so no key is needed.
async function replay(path: string): Promise<void> {
  const saved = JSON.parse(await readFile(path, 'utf8')) as {
    at?: string;
    models?: string[];
    results?: Result[];
  };
  if (!Array.isArray(saved.results) || saved.results.length === 0) {
    console.error(`${path}: no results in it.`);
    process.exitCode = 1;
    return;
  }
  const models = saved.models ?? [
    ...new Set(saved.results.map((r) => r.model)),
  ];
  // The closing messages come from the conversation as it stands now. A file
  // renamed or edited since the run simply shows nothing rather than something
  // the run didn't see.
  const tails = new Map<string, string[]>();
  for (const name of new Set(saved.results.map((r) => r.conversation))) {
    const messages = await readFile(join(DIR, `${name}.json`), 'utf8')
      .then((raw) => JSON.parse(raw) as Message[])
      .catch(() => null);
    if (Array.isArray(messages)) tails.set(name, tailLines(messages));
  }
  console.log(
    `${path}${saved.at === undefined ? '' : ` · run at ${saved.at}`}`,
  );
  report(models, saved.results, tails);
}

async function main(): Promise<void> {
  // An argument naming a file is a results file to re-print; anything else
  // filters the conversations a fresh run covers.
  const arg = process.argv[2];
  if (arg !== undefined && (await stat(arg).catch(() => null))?.isFile()) {
    await replay(arg);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.LLM_URL ?? 'https://openrouter.ai/api/v1';
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set (see .env.example).');
    process.exitCode = 1;
    return;
  }

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
    .filter((f) => f.endsWith('.json') && !f.startsWith(RESULTS_PREFIX))
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

  const conversations: { name: string; messages: Message[] }[] = [];
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
    });
  }

  const total = MODELS.length * conversations.length * RUNS;
  console.log(
    `${MODELS.length} models × ${conversations.length} conversations × ${RUNS} runs = ${total} generations, each carrying a whole conversation.`,
  );
  console.log(`Conversations: ${conversations.map((c) => c.name).join(', ')}`);
  console.log('Starting in 3s — ^C to stop.\n');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const results: {
    model: string;
    conversation: string;
    runs: Run[];
  }[] = [];

  for (const model of MODELS) {
    for (const conversation of conversations) {
      const runs: Run[] = [];
      for (let i = 0; i < RUNS; i++) {
        const run = await runOnce(
          model,
          conversation.messages,
          apiKey,
          baseUrl,
        );
        runs.push(run);
        process.stdout.write(
          `${model} · ${conversation.name} · run ${i + 1}/${RUNS}: ` +
            `${run.error === null ? `${secs(run.firstReplyTokenMs)} to reply, ${secs(run.totalMs)} total` : run.error}\n`,
        );
      }
      results.push({ model, conversation: conversation.name, runs });
    }
  }

  report(
    MODELS,
    results,
    new Map(conversations.map((c) => [c.name, tailLines(c.messages)])),
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(RESULTS_DIR, `${RESULTS_PREFIX}${stamp}.json`);
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    out,
    JSON.stringify(
      { at: new Date().toISOString(), models: MODELS, results },
      null,
      2,
    ),
  );
  console.log(`\nEvery reply in full: ${out}`);
  console.log(`Read it again without spending: npm run llm:benchmark ${out}`);
}

await main();
