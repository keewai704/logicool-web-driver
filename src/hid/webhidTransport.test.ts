import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeHid, FakeHidDevice } from '../test/testUtils';
import { WebHidTransport, requestLogitechDevice } from './webhidTransport';

async function flushTransportStart(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('requestLogitechDevice', () => {
  it('requests devices filtered to Logitech VID', async () => {
    const device = new FakeHidDevice();
    const hid = new FakeHid([device]);

    await expect(requestLogitechDevice(hid)).resolves.toBe(device);

    expect(hid.requestOptions).toEqual({ filters: [{ vendorId: 0x046d }] });
  });
});

describe('WebHidTransport', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the device, sends a report, and resolves the matching response', async () => {
    const device = new FakeHidDevice();
    const transport = new WebHidTransport(device, { timeoutMs: 100 });

    const pending = transport.request({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
      params: [0x01],
    });
    await flushTransportStart();

    expect(device.opened).toBe(true);
    expect(device.sentReports[0]).toMatchObject({
      reportId: 0x10,
      data: new Uint8Array([0xff, 0x08, 0x10, 0x01, 0x00, 0x00]),
    });

    device.emitInputReport(0x10, [0xff, 0x08, 0x10, 0x05]);

    await expect(pending).resolves.toMatchObject({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
      params: new Uint8Array([0x05]),
    });
  });

  it('ignores unrelated input reports while waiting for a response', async () => {
    const device = new FakeHidDevice();
    const transport = new WebHidTransport(device, { timeoutMs: 100 });

    const pending = transport.request({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
    });
    await flushTransportStart();

    device.emitInputReport(0x10, [0xff, 0x09, 0x10, 0x99]);
    device.emitInputReport(0x10, [0xff, 0x08, 0x10, 0x01]);

    await expect(pending).resolves.toMatchObject({ params: new Uint8Array([0x01]) });
  });

  it('rejects when the device does not answer before timeout', async () => {
    vi.useFakeTimers();
    const device = new FakeHidDevice();
    const transport = new WebHidTransport(device, { timeoutMs: 50 });

    const pending = transport.request({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await flushTransportStart();

    await vi.advanceTimersByTimeAsync(51);

    await assertion;
  });
});
