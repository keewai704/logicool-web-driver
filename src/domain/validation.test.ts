import { describe, expect, it } from 'vitest';
import { validateSuperstrikeSettings } from './validation';
import type { SuperstrikeSettings } from '../hid/features';

const validSettings: SuperstrikeSettings = {
  left: { actuation: 5, rapidTrigger: 3, haptics: 4 },
  right: { actuation: 6, rapidTrigger: 2, haptics: 0 },
};

describe('validateSuperstrikeSettings', () => {
  it('accepts values in the supported Superstrike ranges', () => {
    expect(validateSuperstrikeSettings(validSettings)).toEqual({ ok: true, errors: [] });
  });

  it('rejects actuation values outside 1..10', () => {
    const result = validateSuperstrikeSettings({
      ...validSettings,
      left: { ...validSettings.left, actuation: 0 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Left actuation must be an integer from 1 to 10.');
  });

  it('rejects rapid trigger values outside 1..5', () => {
    const result = validateSuperstrikeSettings({
      ...validSettings,
      right: { ...validSettings.right, rapidTrigger: 6 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Right rapid trigger must be an integer from 1 to 5.');
  });

  it('rejects haptics values outside 0..5', () => {
    const result = validateSuperstrikeSettings({
      ...validSettings,
      left: { ...validSettings.left, haptics: -1 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Left haptics must be an integer from 0 to 5.');
  });
});
