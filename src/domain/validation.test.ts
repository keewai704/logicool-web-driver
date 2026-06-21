import { describe, expect, it } from 'vitest';
import { validateExtendedDpiSettings, validateSuperstrikeSettings } from './validation';
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

describe('validateExtendedDpiSettings', () => {
  it('accepts PRO X2 Superstrike DPI values in 50-DPI steps from 100 to 32000', () => {
    expect(validateExtendedDpiSettings({ x: 100, y: 32000, lod: 'HIGH' })).toEqual({ ok: true, errors: [] });
  });

  it('rejects DPI values outside the supported range', () => {
    const result = validateExtendedDpiSettings({ x: 50, y: 32050, lod: 'LOW' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DPI X must be an integer from 100 to 32000 in steps of 50.');
    expect(result.errors).toContain('DPI Y must be an integer from 100 to 32000 in steps of 50.');
  });

  it('rejects DPI values that are not aligned to the supported step', () => {
    const result = validateExtendedDpiSettings({ x: 125, y: 1600, lod: 'MEDIUM' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DPI X must be an integer from 100 to 32000 in steps of 50.');
  });
});
