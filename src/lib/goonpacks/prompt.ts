// Load-time fill of {{PLACEHOLDER}} tokens in a persona prompt with the app's
// current shared sections, so the mechanical rules stay app-owned (spec:
// "System prompt placeholders"). Runtime markers are a different layer: they
// pass through here and are filled per-turn by the voice session.
import {
  CONTROL_SECTION,
  CONTROL_SUMMARY_SECTION,
  MEDIA_SECTION,
  OUTPUT_FORMAT_SECTION,
  SHARED_STYLE_BULLETS,
  TIME_SECTION,
} from '@/lib/companions/shared-prompt';

// Placeholder name = shared-prompt export name, on purpose — but a new
// shared-prompt export still needs adding to SECTIONS below explicitly; this
// record is deliberate, not auto-derived from the module's exports.
const SECTIONS: Record<string, string> = {
  OUTPUT_FORMAT_SECTION,
  SHARED_STYLE_BULLETS,
  CONTROL_SUMMARY_SECTION,
  MEDIA_SECTION,
  CONTROL_SECTION,
};

export function fillSharedSections(
  prompt: string,
  opts: { includeMedia: boolean },
): string {
  const filled = prompt.replace(
    /\{\{([A-Z0-9_]+)\}\}/g,
    (token, name: string) => {
      if (name === 'MEDIA_SECTION' && !opts.includeMedia) return '';
      // Anything that isn't a shared section is left exactly as written: the
      // live markers {{TOY_STATUS}} and {{NOW}} because the voice session fills
      // them per turn, and everything else so a misspelled token shows up in
      // the prompt instead of silently becoming nothing.
      return SECTIONS[name] ?? token;
    },
  );
  // Appended rather than offered as a token: every companion is sent a TIME
  // line, so every companion has to be told how to read it. A token can be left
  // out — by a pack author who never heard of it, or by one with no device that
  // places no {{CONTROL_SECTION}}. Called once per companion (resolve.ts), so
  // it lands once.
  return `${filled}\n\n${TIME_SECTION}`;
}
