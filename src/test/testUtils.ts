import type { HidppReportId } from '../hid/hidpp';

type HidInputReportListener = (event: HIDInputReportEvent) => void;

interface FakeHidDeviceOptions {
  collections?: HIDCollectionInfo[];
  productId?: number;
  productName?: string;
}

export class FakeHidDevice extends EventTarget implements HIDDevice {
  opened = false;
  readonly vendorId = 0x046d;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HIDCollectionInfo[];
  readonly sentReports: Array<{ reportId: number; data: Uint8Array }> = [];

  constructor(options: FakeHidDeviceOptions = {}) {
    super();
    this.productId = options.productId ?? 0xc54d;
    this.productName = options.productName ?? 'Fake PRO X2 SUPERSTRIKE';
    this.collections =
      options.collections ??
      [
        {
          usagePage: 0xff00,
          usage: 0x01,
          inputReports: [{ reportId: 0x10, items: [] }],
          outputReports: [{ reportId: 0x10, items: [] }],
          featureReports: [],
        },
      ];
  }

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
