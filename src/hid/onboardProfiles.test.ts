import { describe, expect, it } from 'vitest';
import {
  encodeOnboardReportRate,
  isOnboardProfileSectorCrcValid,
  patchOnboardProfileSector,
  readOnboardProfileSettings,
  updateOnboardProfileSectorCrc,
} from './onboardProfiles';

function profileSector(size = 32): Uint8Array {
  const sector = new Uint8Array(size).fill(0xff);
  sector[0] = 5;
  sector[1] = 3;
  sector[2] = 0;
  for (let index = 0; index < 5; index += 1) {
    sector[3 + index * 2] = 0x20;
    sector[4 + index * 2] = 0x03;
  }
  return updateOnboardProfileSectorCrc(sector);
}

describe('onboard profile codecs', () => {
  it('patches only persistent report rate and linked DPI fields and updates CRC', () => {
    const original = profileSector();
    const patched = patchOnboardProfileSector(original, {
      dpi: 1600,
      reportRate: '1ms',
    });

    expect(patched).not.toBe(original);
    expect(patched[0]).toBe(1);
    expect(Array.from(patched.slice(3, 13))).toEqual([0x40, 0x06, 0x40, 0x06, 0x40, 0x06, 0x40, 0x06, 0x40, 0x06]);
    expect(Array.from(patched.slice(13, -2))).toEqual(Array.from(original.slice(13, -2)));
    expect(isOnboardProfileSectorCrcValid(patched)).toBe(true);
  });

  it('reads the default DPI slot and onboard report rate from a profile sector', () => {
    const sector = patchOnboardProfileSector(profileSector(), {
      dpi: 1200,
      reportRate: '2ms',
    });

    expect(readOnboardProfileSettings(sector)).toEqual({
      dpi: 1200,
      reportRate: '2ms',
    });
  });

  it('does not encode sub-millisecond report rates into legacy onboard profile fields', () => {
    expect(encodeOnboardReportRate('125us')).toBeUndefined();
    expect(encodeOnboardReportRate('500us')).toBeUndefined();
    expect(encodeOnboardReportRate('1ms')).toBe(1);
    expect(encodeOnboardReportRate('8ms')).toBe(8);
  });
});
