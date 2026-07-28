// TTS playback for Companions: POST the reply text to the /api/tts proxy, which
// streams back mp3, and play it through a shared <audio> element. Barge-in is
// the point here — stop() must cut mid-sentence with no audible tail — so the
// abort signal pauses and resets the element instantly and cancels the fetch.
// Where the browser supports mp3 in Media Source Extensions we feed chunks into
// a SourceBuffer for progressive playback; otherwise we buffer the whole
// (short, fixed) reply into a Blob URL, which still stops instantly on pause().
// Integration code — no unit test (needs real audio playback).
import { ACCESS_HEADER, getAccessId } from '@/lib/companions/access';

export type TtsPlayer = {
  // Resolves when playback ends naturally OR is aborted/stopped. onFirstByte
  // fires once, when the TTS response's bytes start arriving (TTFB).
  play: (
    text: string,
    voiceId: string,
    signal: AbortSignal,
    onFirstByte?: () => void,
  ) => Promise<void>;
  // Pause + reset immediately. Idempotent.
  stop: () => void;
};

// Firefox forces the fallback: it has MediaSource but reports
// isTypeSupported('audio/mpeg') false, so mp3 cannot go through a SourceBuffer
// there. Chromium and Playwright's WebKit both report true — which is not proof
// for Safari, whose MSE behaviour Playwright cannot stand in for.
function canStreamMp3(): boolean {
  return (
    typeof MediaSource !== 'undefined' &&
    MediaSource.isTypeSupported('audio/mpeg')
  );
}

// Append one chunk to a SourceBuffer, resolving once the async append settles.
// appendBuffer can also throw synchronously (detached buffer, quota); the
// caller treats any failure as "stop playback".
function appendChunk(sb: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onUpdateEnd = (): void => {
      sb.removeEventListener('error', onError);
      resolve();
    };
    const onError = (): void => {
      sb.removeEventListener('updateend', onUpdateEnd);
      reject(new Error('SourceBuffer append failed'));
    };
    sb.addEventListener('updateend', onUpdateEnd, { once: true });
    sb.addEventListener('error', onError, { once: true });
    try {
      sb.appendBuffer(chunk as BufferSource);
    } catch (err) {
      sb.removeEventListener('updateend', onUpdateEnd);
      sb.removeEventListener('error', onError);
      reject(err instanceof Error ? err : new Error('appendBuffer threw'));
    }
  });
}

export function createTtsPlayer(audioEl: HTMLAudioElement): TtsPlayer {
  // Teardown for the in-flight playback, if any: cancels the reader, revokes
  // the object URL, removes listeners, and resolves the pending play()
  // promise. Cleared once run so stop() is idempotent.
  let cleanup: (() => void) | null = null;

  function stop(): void {
    const run = cleanup;
    cleanup = null;
    run?.();
    // Hard-reset the element so nothing keeps playing, even if there was no
    // active play() (idempotent). Ordered after cleanup() so the load()-
    // induced events land with our listeners already detached.
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  }

  function play(
    text: string,
    voiceId: string,
    signal: AbortSignal,
    onFirstByte?: () => void,
  ): Promise<void> {
    // Barge-in / mutual exclusion: replace any prior playback before starting.
    stop();
    if (signal.aborted) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let objectUrl: string | null = null;
      let done = false;

      const onEnded = (): void => stop();
      const onError = (): void => stop();
      const onAbort = (): void => stop();

      cleanup = (): void => {
        if (done) return;
        done = true;
        audioEl.removeEventListener('ended', onEnded);
        audioEl.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
        reader?.cancel().catch(() => {});
        reader = null;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        resolve();
      };

      audioEl.addEventListener('ended', onEnded);
      audioEl.addEventListener('error', onError);
      signal.addEventListener('abort', onAbort);

      void (async (): Promise<void> => {
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              [ACCESS_HEADER]: getAccessId(),
            },
            body: JSON.stringify({ text, voiceId }),
            signal,
          });
          if (done) return;
          if (!res.ok || res.body === null) {
            stop();
            return;
          }
          onFirstByte?.();

          if (canStreamMp3()) {
            // Progressive path: pump the stream into a MediaSource so playback
            // starts on the first chunk instead of the last. The Blob fallback
            // below runs in every engine, so this second path exists only to
            // cut time-to-first-audio — the delay between a companion deciding
            // to speak and being heard, which is the latency that shows.
            const mediaSource = new MediaSource();
            objectUrl = URL.createObjectURL(mediaSource);
            audioEl.src = objectUrl;
            await new Promise<void>((open) => {
              mediaSource.addEventListener('sourceopen', () => open(), {
                once: true,
              });
            });
            if (done || mediaSource.readyState !== 'open') return;

            const sb = mediaSource.addSourceBuffer('audio/mpeg');
            reader = res.body.getReader();
            void audioEl.play().catch(() => {});

            for (;;) {
              const { done: streamDone, value } = await reader.read();
              if (done) return;
              if (streamDone) break;
              await appendChunk(sb, value);
              if (done) return;
            }
            if (!done && mediaSource.readyState === 'open') {
              mediaSource.endOfStream();
            }
          } else {
            // Fallback: buffer the whole reply into a Blob URL.
            const blob = await res.blob();
            if (done) return;
            objectUrl = URL.createObjectURL(blob);
            audioEl.src = objectUrl;
            void audioEl.play().catch(() => {});
          }
        } catch {
          // Aborted fetch/read, decode failure, or MediaSource error: settle
          // the promise and leave the element reset.
          if (!done) stop();
        }
      })();
    });
  }

  return { play, stop };
}
