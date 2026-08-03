// The play view's Debug tab: STT state, latency metrics, the LLM request
// viewer's trigger, and the event/command logs. Only rendered while the tab
// is open, so the churning `status` prop costs nothing the rest of the time.

import { useEffect, useState } from 'react';
import { Card } from '@/components/card';
import { LogCard, type LogEntry } from '@/components/log-card';
import { RateLimitMeter } from '@/components/rate-limit-meter';
import type { VacuglideDeviceController } from '@/hooks/use-vacuglide-device';
import type { VoiceStatus } from '@/hooks/use-voice-session';
import { FRAME_MS } from '@/lib/voice/mic';
import { DebugLLMButton } from './debug-llm-button';
import { EventLog } from './event-log';
import { StatRow } from './stat-row';

export function DebugTab({
  status,
  log,
  vacuglide,
  onShowLlmRequest,
}: {
  status: VoiceStatus;
  log: LogEntry[];
  vacuglide: VacuglideDeviceController;
  onShowLlmRequest: () => void;
}) {
  // The ambient countdown is drawn from a deadline, so it only moves when
  // something redraws it. While listening the mic's rms churns `status` fast
  // enough; a typed conversation sends no frames, so a poke pending with the
  // mic off would sit at the figure it was armed with. Ticking at the tenth
  // being displayed, only while one is pending and only while the tab is open.
  const [, tick] = useState(0);
  const counting = status.ambientDueAt !== null && !status.ambientHolding;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [counting]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto">
      <Card title="STT debug" bordered>
        <div className="text-muted-foreground flex gap-4">
          <span>STT {status.phase}</span>
          <span>pre-roll {status.preRollFrames}</span>
          {/* The billable number: audio actually streamed this session. It
              should climb only while you're talking and sit still between
              turns, however long the socket stays open. */}
          <span>
            sent {((status.sentFrames * FRAME_MS) / 1000).toFixed(1)}s
          </span>
          {/* Ambient chat: the next unprompted turn, if any. The deadline comes
              from status, rewritten wherever the scheduler is armed, cancelled
              or latched; the tick above is what makes it count. Without this
              row a poke that never came and one that was never armed look the
              same. */}
          <span>
            ambient{' '}
            {status.ambientHolding
              ? 'waiting for you'
              : status.ambientDueAt === null
                ? 'idle'
                : `in ${Math.max(
                    0,
                    (status.ambientDueAt - Date.now()) / 1000,
                  ).toFixed(1)}s`}
          </span>
        </div>
        <div className="mt-2">
          <p className="min-h-6">
            <span className="text-muted-foreground">finished </span>
            {status.committed !== '' ? (
              status.committed
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
          <p className="min-h-6">
            <span className="text-muted-foreground">partial </span>
            {status.partial !== '' ? (
              <span className="text-muted-foreground">{status.partial}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
      </Card>

      <Card title="Latency" bordered>
        <p className="text-muted-foreground mb-1">LLM</p>
        {status.metrics.llm === null ? (
          <p>—</p>
        ) : (
          <>
            <StatRow label="First token">
              {Math.round(status.metrics.llm.ttftMs)} ms
            </StatRow>
            <StatRow label="Throughput">
              {status.metrics.llm.tps === null
                ? '—'
                : `${status.metrics.llm.tps.toFixed(1)} tok/s`}
            </StatRow>
            <StatRow label="Total">
              {Math.round(status.metrics.llm.totalMs)} ms
            </StatRow>
            {/* Most of the prompt should be cached, and the share should climb
                as the conversation grows. A low or zero share means something
                that changes every turn got in above the conversation. */}
            <StatRow label="Prompt cached">
              {status.metrics.llm.promptTokens === null ||
              status.metrics.llm.cachedTokens === null
                ? 'not reported'
                : `${status.metrics.llm.cachedTokens} / ${status.metrics.llm.promptTokens} tokens`}
            </StatRow>
          </>
        )}
        <p className="text-muted-foreground mt-3 mb-1">TTS</p>
        {status.metrics.tts === null ? (
          <p>—</p>
        ) : (
          <>
            <StatRow label="First audio">
              {status.metrics.tts.ttfbMs === null
                ? '—'
                : `${Math.round(status.metrics.tts.ttfbMs)} ms`}
            </StatRow>
            <StatRow label="Total">
              {Math.round(status.metrics.tts.totalMs)} ms
            </StatRow>
          </>
        )}
      </Card>

      <Card title="LLM request" bordered>
        <p>
          The exact request the next turn would send — system prompt, gap
          markers and all.
        </p>
        <div className="mt-2">
          <DebugLLMButton onClick={onShowLlmRequest} />
        </div>
      </Card>

      <EventLog entries={log} />

      <LogCard
        title="Command log"
        header={<RateLimitMeter {...vacuglide.rateLimit} />}
        entries={vacuglide.logEntries}
      />
    </div>
  );
}
