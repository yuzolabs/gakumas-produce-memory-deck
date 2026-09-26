import { describe, expect, it } from 'vitest';
import { getCustomizationSteps } from './customization-steps';

const values = [1, 2, 3].map((cost) => ({
  id: `level-${cost}`,
  cost,
  label: `${cost}段階`,
  retired: false,
}));

describe('customization steps', () => {
  it('starts at zero and decreases the first level back to no customization', () => {
    expect(getCustomizationSteps(values, '', 3)).toEqual({
      current: expect.objectContaining({ id: '', cost: 0 }),
      previous: undefined,
      next: values[0],
    });
    expect(getCustomizationSteps(values, 'level-1', 3).previous?.id).toBe('');
  });
  it('honors both the effect maximum and the card remaining budget', () => {
    expect(getCustomizationSteps(values, 'level-3', 9).next).toBeUndefined();
    expect(getCustomizationSteps(values, 'level-1', 1).next).toBeUndefined();
    expect(getCustomizationSteps(values, '', 0).next).toBeUndefined();
    expect(getCustomizationSteps(values, 'level-2', 2).previous).toEqual(values[0]);
  });
  it('uses sorted master values without assuming IDs are numbers or mutating the master', () => {
    const allowed = [values[2], values[0]];
    expect(getCustomizationSteps(allowed, 'level-1', 3).next).toEqual(values[2]);
    expect(allowed).toEqual([values[2], values[0]]);
  });
  it('allows reduction after the maximum is lowered and explicit removal of unknown values', () => {
    expect(getCustomizationSteps(values, 'level-3', 1).previous).toEqual(values[1]);
    const unknown = getCustomizationSteps(values, 'old-value', 3);
    expect(unknown.current).toBeUndefined();
    expect(unknown.next).toBeUndefined();
    expect(unknown.previous?.id).toBe('');
  });
  it('does not invent a choice when no allowed values remain', () => {
    const steps = getCustomizationSteps([], '', 3);
    expect(steps.current?.cost).toBe(0);
    expect(steps.next).toBeUndefined();
    expect(steps.previous).toBeUndefined();
  });
});
