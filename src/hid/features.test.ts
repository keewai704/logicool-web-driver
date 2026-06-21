import { describe, expect, it } from 'vitest';
import {
  FEATURE_IDS,
  decodeExtendedDpi,
  decodeExtendedReportRate,
  decodeOnboardMode,
  decodeSuperstrikeRead,
  encodeExtendedDpi,
  encodeExtendedReportRate,
  encodeOnboardMode,
  encodeSuperstrikeWrite,
} from './features';

describe('feature codecs', () => {
  it('exports the Logitech feature ids used by this driver', () => {
    expect(FEATURE_IDS).toMatchObject({
      SUPERSTRIKE_TUNING: 0x1b0c,
      EXTENDED_ADJUSTABLE_DPI: 0x2202,
      EXTENDED_ADJUSTABLE_REPORT_RATE: 0x8061,
      ONBOARD_PROFILES: 0x8100,
    });
  });

  it('encodes Superstrike tuning writes by button and setting', () => {
    expect(encodeSuperstrikeWrite('left', { actuation: 7, rapidTrigger: 3, haptics: 4 }, 0x09)).toEqual([
      0x00, 0x1c, 0x0d, 0x10,
    ]);
    expect(encodeSuperstrikeWrite('right', { actuation: 5, rapidTrigger: 2, haptics: 0 }, 0x08)).toEqual([
      0x01, 0x14, 0x08, 0x00,
    ]);
  });

  it('decodes Superstrike tuning reads from setting bytes', () => {
    expect(decodeSuperstrikeRead(new Uint8Array([0x00, 0x14, 0x08, 0x10]))).toEqual({
      button: 'left',
      settings: { actuation: 5, rapidTrigger: 2, haptics: 4 },
    });
  });

  it('encodes and decodes extended DPI settings', () => {
    expect(encodeExtendedDpi({ x: 1600, y: 1600, lod: 'HIGH' })).toEqual([0x06, 0x40, 0x06, 0x40, 0x01]);
    expect(decodeExtendedDpi(new Uint8Array([0x03, 0x20, 0x06, 0x40, 0x00]))).toEqual({
      x: 800,
      y: 1600,
      lod: 'LOW',
    });
  });

  it('encodes and decodes extended report rates', () => {
    expect(encodeExtendedReportRate('125us')).toEqual([0x06]);
    expect(decodeExtendedReportRate(new Uint8Array([0x04]))).toBe('500us');
  });

  it('encodes and decodes onboard mode', () => {
    expect(encodeOnboardMode('onboard')).toEqual([0x01]);
    expect(encodeOnboardMode('host')).toEqual([0x02]);
    expect(decodeOnboardMode(new Uint8Array([0x02]))).toBe('host');
  });
});
