import { describe, expect, it } from 'vitest';
import { createBackup } from './backup';
import type { DeviceSnapshot } from '../hid/superstrikeDriver';

const snapshot: DeviceSnapshot = {
  schemaVersion: 1,
  capturedAt: '2026-06-21T00:00:00.000Z',
  device: {
    productName: 'Fake PRO X2 SUPERSTRIKE',
    vendorId: 0x046d,
    productId: 0xc54d,
  },
  features: {
    SUPERSTRIKE_TUNING: {
      id: 0x1b0c,
      name: 'SUPERSTRIKE_TUNING',
      index: 0x08,
      flags: 0,
      version: 1,
      supported: true,
    },
  },
  unsupportedFeatures: [],
  superstrike: {
    left: { actuation: 5, rapidTrigger: 3, haptics: 4 },
    right: { actuation: 6, rapidTrigger: 2, haptics: 0 },
  },
  logs: [],
};

describe('createBackup', () => {
  it('wraps a device snapshot in a stable backup document', () => {
    const backup = createBackup(snapshot, new Date('2026-06-21T01:02:03.000Z'));

    expect(backup).toMatchObject({
      schemaVersion: 1,
      kind: 'superstrike-webhid-backup',
      exportedAt: '2026-06-21T01:02:03.000Z',
      snapshot: {
        device: snapshot.device,
        features: snapshot.features,
        superstrike: snapshot.superstrike,
      },
    });
  });
});
