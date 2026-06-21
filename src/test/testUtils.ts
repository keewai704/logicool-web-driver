import type { HidppReportId } from '../hid/hidpp';

type HidInputReportListener = (event: HIDInputReportEvent) => void;

export class FakeHidDevice extends EventTarget implements HIDDevice {
  opened = false;
  readonly vendorId = 0x046d;
  readonly productId = 0xc54d;
  readonly productName = 'Fake PRO X2 SUPERSTRIKE';
  readonly sentReports: Array<{ reportId: number; data: Uint8Array }> = [];

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async sendReport(reportId: number, data: BufferSource): Promise<void> {
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.sentReports.push({ reportId, data: bytes.slice() });
  }

  addEventListener(type: 'inputreport', listener: HidInputReportListener): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | HidInputReportListener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, callback as EventListenerOrEventListenerObject | null, options);
  }

  removeEventListener(type: 'inputreport', listener: HidInputReportListener): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | HidInputReportListener | null,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, callback as EventListenerOrEventListenerObject | null, options);
  }

  emitInputReport(reportId: HidppReportId, bytes: readonly number[]): void {
    const data = new Uint8Array(bytes);
    const event = new Event('inputreport') as HIDInputReportEvent;
    Object.defineProperties(event, {
      data: { value: new DataView(data.buffer), enumerable: true },
      device: { value: this, enumerable: true },
      reportId: { value: reportId, enumerable: true },
    });
    this.dispatchEvent(event);
  }
}

export class FakeHid extends EventTarget implements HID {
  requestOptions: HIDDeviceRequestOptions | null = null;

  constructor(private readonly devices: HIDDevice[]) {
    super();
  }

  async getDevices(): Promise<HIDDevice[]> {
    return this.devices;
  }

  async requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]> {
    this.requestOptions = options;
    return this.devices;
  }
}
