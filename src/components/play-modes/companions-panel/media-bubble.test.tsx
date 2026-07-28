/**
 * @jest-environment jsdom
 */
// Which of the three things a transcript bubble renders for one media entry:
// the placeholder that holds the thumbnail's space, the thumbnail itself, or
// the never-substitute notice. When an entry reaches each state is
// use-media-url.test.ts's.
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import type { CompanionMedia } from '@/lib/companions/companions';
import { MediaBubble } from './media-bubble';

// next/image renders an <img> with a srcset built for a configured loader,
// which a blob: URL has no business going through. The stub is the <img> the
// browser would end up with, so the assertions read the src the bubble chose.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// A media entry whose file opens when `open` resolves — held pending by a test
// that wants the loading state to stay put.
function entry(
  kind: CompanionMedia['kind'],
  open: () => Promise<string>,
): CompanionMedia {
  const media: CompanionMedia = {
    kind,
    caption: 'a still',
    description: 'a still, described at length',
    ref: 'goonpack:pub.pack@1.0.0/one',
    load: () =>
      open().then((url) => {
        media.src = url;
        return url;
      }),
    forget: () => {
      media.src = undefined;
    },
  };
  return media;
}

const ready = (kind: CompanionMedia['kind']) =>
  entry(kind, () => Promise.resolve('blob:one'));

describe('MediaBubble', () => {
  it('holds the thumbnail space with a placeholder while the file is opening', () => {
    const { container } = render(
      <MediaBubble
        media={entry('image', () => new Promise<string>(() => {}))}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders a still as an image behind a button that opens the picture', async () => {
    render(<MediaBubble media={ready('image')} onOpen={() => {}} />);
    const button = await screen.findByRole('button', { name: 'Open picture' });
    expect(button.querySelector('img')?.getAttribute('src')).toBe('blob:one');
  });

  it('renders a video inline as its own preview, muted and looping', async () => {
    const { container } = render(
      <MediaBubble media={ready('video')} onOpen={() => {}} />,
    );
    await screen.findByRole('button', { name: 'Open video' });
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('blob:one');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
  });

  it('renders the notice, never a substitute, for an entry whose file has gone', async () => {
    render(
      <MediaBubble
        media={entry('image', () => Promise.reject(new Error('gone')))}
        onOpen={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('Media from another pack.')).toBeDefined(),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
