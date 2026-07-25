// Load-time fill of {{PLACEHOLDER}} tokens in a persona prompt with the app's
// current shared sections, so the mechanical rules stay app-owned (spec:
// "System prompt placeholders"). Runtime markers are a different layer: they
// pass through here and are filled per-turn by the voice session.
import {
  CONTROL_SECTION,
  CONTROL_SUMMARY_SECTION,
  OUTPUT_FORMAT_SECTION,
  PICTURES_SECTION,
  SHARED_STYLE_BULLETS,
} from '@/lib/companions/shared-prompt';

// Placeholder name = shared-prompt export name, on purpose — but a new
// shared-prompt export still needs adding to SECTIONS below explicitly; this
// record is deliberate, not auto-derived from the module's exports.
const SECTIONS: Record<string, string> = {
  OUTPUT_FORMAT_SECTION,
  SHARED_STYLE_BULLETS,
  CONTROL_SUMMARY_SECTION,
  PICTURES_SECTION,
  CONTROL_SECTION,
};

// Filled per-turn by the session (buildSystemPrompt), not at load.
const LIVE_MARKERS = new Set(['TOY_STATUS', 'NOW']);

export function fillSharedSections(
  prompt: string,
  opts: { includePictures: boolean },
): string {
  return prompt.replace(/\{\{([A-Z0-9_]+)\}\}/g, (token, name: string) => {
    if (LIVE_MARKERS.has(name)) return token;
    if (name === 'PICTURES_SECTION' && !opts.includePictures) return '';
    return SECTIONS[name] ?? ''; // unknown tokens are dropped, per spec
  });
}
