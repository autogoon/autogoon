// Load-time fill of {{PLACEHOLDER}} tokens in a persona prompt with the app's
// current shared sections, so the mechanical rules stay app-owned (spec:
// "System prompt placeholders").
import {
  CONTROL_SECTION,
  CONTROL_SUMMARY_SECTION,
  OUTPUT_FORMAT_SECTION,
  SHARED_STYLE_BULLETS,
  TIME_SECTION,
  mediaSection,
} from '@/lib/companions/shared-prompt';

// Placeholder name = shared-prompt export name, on purpose — but a new
// shared-prompt export still needs adding to SECTIONS explicitly.
// MEDIA_SECTION is not here: it is a function of the companion's own summary
// — and of its absence — filled from opts rather than being one fixed block.
const SECTIONS: Record<string, string> = {
  OUTPUT_FORMAT_SECTION,
  SHARED_STYLE_BULLETS,
  CONTROL_SUMMARY_SECTION,
  CONTROL_SECTION,
};

export function fillSharedSections(
  prompt: string,
  opts: { mediaSummary?: string },
): string {
  const filled = prompt.replace(
    /\{\{([A-Z0-9_]+)\}\}/g,
    (token, name: string) => {
      // A companion with no media has no summary, and gets the section's
      // other form — the one saying there is nothing to send.
      if (name === 'MEDIA_SECTION') return mediaSection(opts.mediaSummary);
      // Anything that isn't a shared section is left exactly as written, so a
      // misspelled token shows up in the prompt instead of silently becoming
      // nothing.
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
