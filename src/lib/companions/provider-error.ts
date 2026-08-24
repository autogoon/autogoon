// Turning a provider's failure into a sentence the user can act on. The browser
// calls OpenRouter and ElevenLabs itself, so this is where a paid dependency
// failing gets explained — mid-session, hands-free, with nothing on screen but
// the error line.
//
// The statuses are told apart because the answers differ: a rejected key is
// fixed in Settings, an empty balance at the provider, a rate limit by waiting.
// Everything else keeps the provider's own message, which is what makes a bad
// model slug diagnosable at all.
//
// An auth failure's body is never shown: OpenAI-compatible endpoints quote the
// key back in it.

function detailOf(body: string): string {
  // ElevenLabs answers {"detail": {"message": "..."}} (or a bare string);
  // OpenRouter {"error": {"message": "..."}}. Anything unrecognised is used as
  // it came — a truncated HTML error page is still a better clue than nothing.
  try {
    const parsed = JSON.parse(body) as {
      detail?: string | { message?: string };
      error?: { message?: string };
    };
    const detail = parsed.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message !== undefined) return detail.message;
    if (parsed.error?.message !== undefined) return parsed.error.message;
  } catch {
    // not JSON
  }
  return body.slice(0, 200);
}

// The shared mapping. `provider` names who failed, and reads as the subject of
// each sentence.
export function providerMessage(
  provider: string,
  status: number,
  body: string,
): string {
  if (status === 401 || status === 403)
    return `${provider} rejected your API key — check it in Settings.`;
  if (status === 402) return `${provider} is out of credit.`;
  if (status === 429)
    return `${provider} is rate limiting — too many requests.`;
  const detail = detailOf(body);
  return detail === ''
    ? `${provider} failed (${status}).`
    : `${provider} ${status}: ${detail}`;
}

// Whose failure it is. LLM_URL can name any OpenAI-compatible endpoint, so the
// name is only OpenRouter's when the URL is.
export function llmProvider(llmUrl: string): string {
  try {
    return new URL(llmUrl).hostname.endsWith('openrouter.ai')
      ? 'OpenRouter'
      : 'The LLM provider';
  } catch {
    return 'The LLM provider';
  }
}

// The openai SDK throws rather than returning a response, and carries the
// status on the error. One without a status never reached the provider — a
// DNS failure, an offline device — and says so instead of quoting a number.
export function llmErrorMessage(error: unknown, llmUrl: string): string {
  const provider = llmProvider(llmUrl);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof status !== 'number') return `${provider} unreachable: ${message}`;
  return providerMessage(provider, status, message);
}

export function elevenLabsMessage(status: number, body: string): string {
  return providerMessage('ElevenLabs', status, body);
}
