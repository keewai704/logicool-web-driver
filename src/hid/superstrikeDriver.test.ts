import { describe, expect, it } from 'vitest';
import type { HidppFeatureRequest, HidppResponse } from './hidpp';
import { FEATURE_IDS } from './features';
import { SuperstrikeDriver, type HidppTransport } from './superstrikeDriver';

class StubTransport implements HidppTransport {
  readonly requests: HidppFeatureRequest[] = [];

  constructor(private readonly handler: (request: HidppFeatureRequest) => HidppResponse | Promise<HidppResponse>) {}

  async request(request: HidppFeatureRequest): Promise<HidppResponse> {
    this.requests.push(request);
    return this.handler(request);
  }
}

function responseFor(request: HidppFeatureRequest, params: number[]): HidppResponse {
  return {
    reportId: request.reportId,
    deviceIndex: request.deviceIndex,
    featureIndex: request.featureIndex,
    functionId: request.functionId,
    params: new Uint8Array(params),
  };
}

describe('SuperstrikeDriver', () => {
  it('reads feature support and marks missing features as unsupported', async () => {
    const transport = new StubTransport((request) => {
      const featureId = (request.params?.[0] ?? 0) << 8 | (request.params?.[1] ?? 0);
      if (featureId === FEATURE_IDS.FEATURE_SET) {
        return responseFor(request, [0x01, 0x00, 0x02]);
      }
      if (featureId === FEATURE_IDS.SUPERSTRIKE_TUNING) {
        return responseFor(request, [0x08, 0x00, 0x01]);
      }
      if (request.featureIndex === 0x08 && request.functionId === 0x28) {
        return responseFor(request, [request.params?.[0] ?? 0, 0x14, 0x08, 0x00]);
      }
      return responseFor(request, [0x00, 0x00, 0x00]);
    });

    const driver = new SuperstrikeDriver(transport, {
      productName: 'Fake PRO X2 SUPERSTRIKE',
      vendorId: 0x046d,
      productId: 0xc54d,
    });

    const snapshot = await driver.readSnapshot();

    expect(snapshot.features.SUPERSTRIKE_TUNING?.index).toBe(0x08);
    expect(snapshot.unsupportedFeatures).toContain('EXTENDED_ADJUSTABLE_DPI');
    expect(snapshot.device.productName).toBe('Fake PRO X2 SUPERSTRIKE');
    expect(transport.requests[0]).toMatchObject({ reportId: 0x11, deviceIndex: 0x01 });
    expect(snapshot.superstrike?.left).toEqual({ actuation: 5, rapidTrigger: 2, haptics: 0 });
  });

  it('refuses invalid Superstrike writes before sending HID reports', async () => {
    const transport = new StubTransport((request) => responseFor(request, [0x08, 0x00, 0x01]));
    const driver = new SuperstrikeDriver(transport, {
      productName: 'Fake PRO X2 SUPERSTRIKE',
      vendorId: 0x046d,
      productId: 0xc54d,
    });

    await expect(
      driver.writeSuperstrikeSettings({
        left: { actuation: 0, rapidTrigger: 3, haptics: 4 },
        right: { actuation: 6, rapidTrigger: 2, haptics: 0 },
      }),
    ).rejects.toThrow(/Left actuation/);

    expect(transport.requests).toHaveLength(0);
  });

  it('writes validated Superstrike settings through the feature index', async () => {
    const transport = new StubTransport((request) => {
      const featureId = (request.params?.[0] ?? 0) << 8 | (request.params?.[1] ?? 0);
      if (featureId === FEATURE_IDS.FEATURE_SET) {
        return responseFor(request, [0x01, 0x00, 0x02]);
      }
      if (featureId === FEATURE_IDS.SUPERSTRIKE_TUNING) {
        return responseFor(request, [0x08, 0x00, 0x01]);
      }
      if (request.featureIndex === 0x08 && request.functionId === 0x28) {
        return responseFor(request, [request.params?.[0] ?? 0, 0x14, 0x09, 0x00]);
      }
      return responseFor(request, [0x00, 0x00, 0x00]);
    });
    const driver = new SuperstrikeDriver(transport, {
      productName: 'Fake PRO X2 SUPERSTRIKE',
      vendorId: 0x046d,
      productId: 0xc54d,
    });

    await driver.writeSuperstrikeSettings({
      left: { actuation: 5, rapidTrigger: 3, haptics: 4 },
      right: { actuation: 6, rapidTrigger: 2, haptics: 0 },
    });

    expect(transport.requests.some((request) => request.featureIndex === 0x08 && request.functionId === 0x28)).toBe(true);
    const writeRequests = transport.requests.filter((request) => request.featureIndex === 0x08 && request.functionId === 0x18);
    expect(writeRequests).toHaveLength(2);
    expect(writeRequests.at(0)).toMatchObject({ reportId: 0x11, deviceIndex: 0x01, params: [0x00, 0x14, 0x0d, 0x10] });
    expect(writeRequests.at(1)).toMatchObject({ reportId: 0x11, deviceIndex: 0x01, params: [0x01, 0x18, 0x09, 0x00] });
  });
});
