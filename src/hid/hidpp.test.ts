import { describe, expect, it } from 'vitest';
import { buildFeatureRequest, parseFeatureResponse, toHex } from './hidpp';

describe('hidpp packet helpers', () => {
  it('builds a short HID++ feature request', () => {
    const packet = buildFeatureRequest({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
      params: [0x00, 0x01],
    });

    expect(Array.from(packet)).toEqual([0xff, 0x08, 0x10, 0x00, 0x01, 0x00]);
  });

  it('builds a long HID++ feature request padded to 19 bytes', () => {
    const packet = buildFeatureRequest({
      reportId: 0x11,
      deviceIndex: 0x01,
      featureIndex: 0x0a,
      functionId: 0x50,
      params: Array.from({ length: 14 }, (_, index) => index),
    });

    expect(packet).toHaveLength(19);
    expect(Array.from(packet.slice(0, 5))).toEqual([0x01, 0x0a, 0x50, 0x00, 0x01]);
    expect(packet[16]).toBe(13);
    expect(packet[17]).toBe(0);
    expect(packet[18]).toBe(0);
  });

  it('rejects params that do not fit in the chosen report', () => {
    expect(() =>
      buildFeatureRequest({
        reportId: 0x10,
        deviceIndex: 0xff,
        featureIndex: 0x08,
        functionId: 0x10,
        params: [0, 1, 2, 3],
      }),
    ).toThrow(/too many params/i);
  });

  it('parses response bytes into header and params', () => {
    const response = parseFeatureResponse(0x10, new Uint8Array([0xff, 0x08, 0x10, 0x01, 0x02, 0x03]));

    expect(response).toEqual({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
      params: new Uint8Array([0x01, 0x02, 0x03]),
    });
  });

  it('formats bytes as uppercase hex', () => {
    expect(toHex([0, 10, 255])).toBe('00 0A FF');
  });
});
