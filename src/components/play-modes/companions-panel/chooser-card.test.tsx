/**
 * @jest-environment jsdom
 */
// What the card does with a pairing that would leave the companion claiming a
// clock and having none (overlayNeedsZone): the overlay can't be picked, isn't
// restored from a remembered selection, and doesn't survive a base switch.
// Which pairings those are is entries.test.ts's.
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { Companion } from '@/lib/companions/companions';
import type { LibraryEntry, PackOption } from '@/lib/goonpacks/entries';
import { ChooserCard } from './chooser-card';

// What jsdom doesn't implement and the overlay picker's listbox uses: Radix
// tracks the pointer through capture and keeps the highlighted row in view,
// and its popper measures the trigger.
Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn(() => false);
Element.prototype.setPointerCapture = jest.fn();
Element.prototype.releasePointerCapture = jest.fn();
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const companion: Companion = {
  id: 'pub.comp',
  name: 'Testy',
  description: 'a test companion',
  intro: 'a test scene',
  gender: 'female',
  accentColour: 'pink',
  voiceId: 'v',
  systemPrompt: 'p',
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

// No pack source on disk, which is every build but a dev server's. Typed off
// the card's own prop so the empty list isn't inferred as a list of nothing.
type Disk = ComponentProps<typeof ChooserCard>['disk'];

const NO_DISK: Disk = {
  dirs: new Map<string, string>(),
  experiments: [],
  chosen: () => undefined,
  onChoose: () => {},
};

const card = (
  bases: PackOption[],
  sel: { base: string | null; overlay: string | null } | undefined,
  onSelectPacks = jest.fn(),
  disk = NO_DISK,
) => {
  render(
    <ChooserCard
      entry={entry(bases)}
      sel={sel}
      onSelectPacks={onSelectPacks}
      onPick={jest.fn()}
      disk={disk}
    />,
  );
  return onSelectPacks;
};

// The overlay picker is a listbox, so its options exist only while it is open,
// and an option is a div rather than an <option> — refusing one shows as
// aria-disabled, not as the disabled property.
const overlayTrigger = (): HTMLElement =>
  screen.getByRole('combobox', { name: /overlay/i });

const overlayOption = (): HTMLElement => {
  // Opened from the keyboard: jsdom has no PointerEvent, and the pointer path
  // wants capture APIs it doesn't implement either.
  fireEvent.keyDown(overlayTrigger(), { key: 'ArrowDown' });
  return screen.getByRole('option', { name: /late 1\.0\.0/ });
};

describe('ChooserCard', () => {
  it('disables an overlay that the selected base leaves without a zone', () => {
    card([NO_ZONE, WITH_ZONE], { base: NO_ZONE.key, overlay: null });
    expect(overlayOption().getAttribute('aria-disabled')).toBe('true');
  });

  it('offers an overlay that turns real time on when the selected base supplies a zone', () => {
    card([NO_ZONE, WITH_ZONE], { base: WITH_ZONE.key, overlay: null });
    expect(overlayOption().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('ignores a remembered overlay the selected base leaves without a zone', () => {
    card([NO_ZONE, WITH_ZONE], {
      base: NO_ZONE.key,
      overlay: NEEDS_ZONE.key,
    });
    expect(overlayTrigger().textContent).toContain('default');
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

  it('offers no descriptions to choose between for a companion read out of storage', () => {
    card([NO_ZONE], { base: NO_ZONE.key, overlay: null });
    expect(
      screen.queryByRole('combobox', { name: /descriptions/i }),
    ).toBeNull();
  });

  it('offers a source on disk every experiment and its stock sidecars', () => {
    card([NO_ZONE], { base: NO_ZONE.key, overlay: null }, jest.fn(), {
      ...NO_DISK,
      dirs: new Map([[NO_ZONE.key!, 'comp']]),
      experiments: ['2026-08-02-baseline'],
    });
    const select = screen.getByRole<HTMLSelectElement>('combobox', {
      name: /descriptions/i,
    });
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Stock',
      '2026-08-02-baseline',
    ]);
  });

  // The key comes out of the manifest in the tree, so it is a consequence of
  // which sidecars were read rather than a name for the directory they were
  // read from — and the choice is about the directory.
  it('writes the choice against the directory rather than the pack key', () => {
    const onChoose = jest.fn();
    card([NO_ZONE], { base: NO_ZONE.key, overlay: null }, jest.fn(), {
      ...NO_DISK,
      dirs: new Map([[NO_ZONE.key!, 'a-directory']]),
      experiments: ['2026-08-02-baseline'],
      onChoose,
    });
    fireEvent.change(screen.getByRole('combobox', { name: /descriptions/i }), {
      target: { value: '2026-08-02-baseline' },
    });
    expect(onChoose).toHaveBeenCalledWith('a-directory', '2026-08-02-baseline');
  });

  it('asks for the stock sidecars by naming no experiment at all', () => {
    const onChoose = jest.fn();
    card([NO_ZONE], { base: NO_ZONE.key, overlay: null }, jest.fn(), {
      ...NO_DISK,
      dirs: new Map([[NO_ZONE.key!, 'comp']]),
      experiments: ['2026-08-02-baseline'],
      chosen: () => '2026-08-02-baseline',
      onChoose,
    });
    fireEvent.change(screen.getByRole('combobox', { name: /descriptions/i }), {
      target: { value: 'default' },
    });
    expect(onChoose).toHaveBeenCalledWith('comp', undefined);
  });

  // A pairing can stack two sources on disk, but only one of them supplies the
  // media, and the descriptions are read out of that one. Picking the overlay
  // is what settles which (mediaSource).
  it('asks about the base where the selected overlay brings no media of its own', () => {
    const onChoose = jest.fn();
    card(
      [WITH_ZONE],
      { base: WITH_ZONE.key, overlay: NEEDS_ZONE.key },
      jest.fn(),
      {
        ...NO_DISK,
        dirs: new Map([
          [WITH_ZONE.key!, 'the-base'],
          [NEEDS_ZONE.key!, 'the-overlay'],
        ]),
        experiments: ['2026-08-02-baseline'],
        onChoose,
      },
    );
    fireEvent.change(screen.getByRole('combobox', { name: /descriptions/i }), {
      target: { value: '2026-08-02-baseline' },
    });
    expect(onChoose).toHaveBeenCalledWith('the-base', '2026-08-02-baseline');
  });

  it('asks about the overlay where it brings the media the pair plays with', () => {
    const onChoose = jest.fn();
    const withMedia = option('late.night@1.0.0', {
      usesRealTime: true,
      media: { images: 3, videos: 0 },
    });
    render(
      <ChooserCard
        entry={{ companion, bases: [WITH_ZONE], overlays: [withMedia] }}
        sel={{ base: WITH_ZONE.key, overlay: withMedia.key }}
        onSelectPacks={jest.fn()}
        onPick={jest.fn()}
        disk={{
          ...NO_DISK,
          dirs: new Map([
            [WITH_ZONE.key!, 'the-base'],
            [withMedia.key!, 'the-overlay'],
          ]),
          experiments: ['2026-08-02-baseline'],
          onChoose,
        }}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: /descriptions/i }), {
      target: { value: '2026-08-02-baseline' },
    });
    expect(onChoose).toHaveBeenCalledWith('the-overlay', '2026-08-02-baseline');
  });

  it('asks about nothing where the overlay strips the media, since none is played', () => {
    const stripped = option('late.night@1.0.0', {
      usesRealTime: true,
      noMedia: true,
    });
    render(
      <ChooserCard
        entry={{ companion, bases: [WITH_ZONE], overlays: [stripped] }}
        sel={{ base: WITH_ZONE.key, overlay: stripped.key }}
        onSelectPacks={jest.fn()}
        onPick={jest.fn()}
        disk={{
          ...NO_DISK,
          dirs: new Map([[WITH_ZONE.key!, 'the-base']]),
          experiments: ['2026-08-02-baseline'],
        }}
      />,
    );
    expect(
      screen.queryByRole('combobox', { name: /descriptions/i }),
    ).toBeNull();
  });

  // What the pair plays with, which is the overlay's set when it brings one and
  // the base's otherwise (effectiveMedia). The counting is entries.test.ts's;
  // this is that the card puts it on screen at all.
  it('says how much media the selected pair plays with', () => {
    card(
      [option('pub.comp@1.0.0', { media: { images: 164, videos: 2 } })],
      undefined,
    );
    expect(screen.getByText('164 pictures · 2 videos')).not.toBeNull();
  });

  it('says nothing about media for a pair that plays with none', () => {
    card([NO_ZONE], undefined);
    expect(screen.queryByText(/pictures/)).toBeNull();
  });
});
