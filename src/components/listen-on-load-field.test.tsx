/**
 * @jest-environment jsdom
 */
// What the field does either side of reading storage: it can't be pressed
// before the stored value has arrived, because until then the segment it would
// show selected is a guess. That the stored value round-trips at all is
// listen-on-load.test.ts's.
import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { ListenOnLoadField } from './listen-on-load-field';
import { listensOnLoad, setListensOnLoad } from '@/lib/listen-on-load';

describe('ListenOnLoadField', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('leaves both segments disabled on the first paint', () => {
    // renderToString, not render: the latter flushes effects, so the window
    // this guards — what is on screen before the stored value has been read —
    // does not exist under it. Matched as the serialised attribute rather than
    // the bare word, which also appears in Button's `disabled:opacity-50`.
    const first = renderToString(<ListenOnLoadField />);
    expect(first.match(/disabled=""/g)).toHaveLength(2);
  });

  it('offers both segments once the stored value has been read', () => {
    act(() => {
      render(<ListenOnLoadField />);
    });
    for (const label of ['Wait for me', 'Listen on load']) {
      expect(screen.getByText(label).closest('button')?.disabled).toBe(false);
    }
  });

  it('writes the choice for the next load', () => {
    act(() => {
      render(<ListenOnLoadField />);
    });
    act(() => {
      screen.getByRole('button', { name: 'Listen on load' }).click();
    });
    expect(listensOnLoad()).toBe(true);

    act(() => {
      screen.getByRole('button', { name: 'Wait for me' }).click();
    });
    expect(listensOnLoad()).toBe(false);
  });

  it('shows the stored choice rather than the default', () => {
    setListensOnLoad(true);
    act(() => {
      render(<ListenOnLoadField />);
    });
    // The selected segment is the one carrying the fill; the rest are muted.
    expect(
      screen.getByRole('button', { name: 'Listen on load' }).className,
    ).toContain('bg-secondary');
    expect(
      screen.getByRole('button', { name: 'Wait for me' }).className,
    ).toContain('text-muted-foreground');
  });
});
