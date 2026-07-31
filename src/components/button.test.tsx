/**
 * @jest-environment jsdom
 */
// What this file decides: that a control which can't be used doesn't advertise
// a word for it. A Command's `enabled` gates the button and the grammar
// together, so a disabled button's word is never live.
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { Button } from './button';
import { Segmented } from './segmented';

describe('Button', () => {
  it('shows the voice chip while the control can be used', () => {
    render(
      <Button voiceCommand="cumming" disabled={false}>
        Finish
      </Button>,
    );

    expect(screen.queryByText('cumming')).not.toBeNull();
  });

  it('drops the voice chip when the control is disabled', () => {
    render(
      <Button voiceCommand="cumming" disabled>
        Finish
      </Button>,
    );

    expect(screen.queryByText('cumming')).toBeNull();
  });
});

describe('Segmented', () => {
  it('disables every segment together, not just the selected one', () => {
    render(
      <Segmented
        options={[
          { value: 'off', label: 'Off', voiceCommand: 'off' },
          { value: 'high', label: 'High', voiceCommand: 'high' },
        ]}
        value="off"
        onChange={() => {}}
        activeClass="active"
        disabled
      />,
    );

    for (const label of ['Off', 'High']) {
      expect(screen.getByText(label).closest('button')?.disabled).toBe(true);
    }
  });
});
