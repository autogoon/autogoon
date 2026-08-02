/**
 * @jest-environment jsdom
 */
// What the card does with a pairing that would leave the companion claiming a
// clock and having none (overlayNeedsZone): the overlay can't be picked, isn't
// restored from a remembered selection, and doesn't survive a base switch.
// Which pairings those are is entries.test.ts's.
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Companion } from '@/lib/companions/companions';
import type { LibraryEntry, PackOption } from '@/lib/goonpacks/entries';
import { ChooserCard } from './chooser-card';

const companion: Companion = {
  id: 'pub.comp',
  name: 'Testy',
  description: 'a test companion',
  intro: 'a test scene',
  gender: 'female',
  accentColour: 'pink',
  voiceId: 'v',
  systemPrompt: 'p',
  model: 'm',
  contextWindow: 10,
  passesReasoning: true,
  chattiness: 3,
  playfulness: 3,
  timezone: 'Europe/London',
  usesRealTime: true,
  knowsUserTime: true,
};

const option = (key: string, extra: Partial<PackOption> = {}): PackOption => ({
  key,
  label: key.split('.')[0]!,
  version: '1.0.0',
  media: { images: 0, videos: 0 },
  changed: [],
  ...extra,
});

// Two base versions that disagree about the clock, and one overlay that turns
// real time on without carrying a zone — so it pairs with one and not the
// other.
const WITH_ZONE = option('pub.comp@2.0.0', {
  usesRealTime: true,
  timezone: 'Europe/Riga',
});
const NO_ZONE = option('pub.comp@1.0.0', { usesRealTime: false });
const NEEDS_ZONE = option('late.night@1.0.0', { usesRealTime: true });

const entry = (bases: PackOption[]): LibraryEntry => ({
  companion,
  bases,
  overlays: [NEEDS_ZONE],
});

const card = (
  bases: PackOption[],
  sel: { base: string | null; overlay: string | null } | undefined,
  onSelectPacks = jest.fn(),
) => {
  render(
    <ChooserCard
      entry={entry(bases)}
      sel={sel}
      onSelectPacks={onSelectPacks}
      onPick={jest.fn()}
    />,
  );
  return onSelectPacks;
};

const overlayOption = (): HTMLOptionElement =>
  screen.getByRole('option', { name: /late 1\.0\.0/ });

describe('ChooserCard', () => {
  it('disables an overlay that the selected base leaves without a zone', () => {
    card([NO_ZONE, WITH_ZONE], { base: NO_ZONE.key, overlay: null });
    expect(overlayOption().disabled).toBe(true);
  });

  it('offers an overlay that turns real time on when the selected base supplies a zone', () => {
    card([NO_ZONE, WITH_ZONE], { base: WITH_ZONE.key, overlay: null });
    expect(overlayOption().disabled).toBe(false);
  });

  it('ignores a remembered overlay the selected base leaves without a zone', () => {
    card([NO_ZONE, WITH_ZONE], {
      base: NO_ZONE.key,
      overlay: NEEDS_ZONE.key,
    });
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: /overlay/i })
        .value,
    ).toBe('default');
  });

  it('drops the selected overlay when the base it switches to leaves it without a zone', () => {
    const onSelectPacks = card([NO_ZONE, WITH_ZONE], {
      base: WITH_ZONE.key,
      overlay: NEEDS_ZONE.key,
    });
    fireEvent.change(screen.getByRole('combobox', { name: /version/i }), {
      target: { value: NO_ZONE.key },
    });
    expect(onSelectPacks).toHaveBeenCalledWith(companion.id, {
      base: NO_ZONE.key,
      overlay: null,
    });
  });
});
