/**
 * @jest-environment jsdom
 */
// The stored preference, and what it reads as when storage says something
// unexpected — the answer decides whether a tab holds the microphone.
import { beforeEach, describe, expect, it } from '@jest/globals';
import { listensOnLoad, setListensOnLoad } from './listen-on-load';

describe('listensOnLoad', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is off in a browser that has never been told', () => {
    expect(listensOnLoad()).toBe(false);
  });

  it('reads back what setListensOnLoad wrote', () => {
    setListensOnLoad(true);
    expect(listensOnLoad()).toBe(true);
    setListensOnLoad(false);
    expect(listensOnLoad()).toBe(false);
  });

  it('reads a value it does not recognise as off', () => {
    localStorage.setItem('autogoon-listen-on-load', 'yes');
    expect(listensOnLoad()).toBe(false);
  });
});
