interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HIDInputReportEvent extends Event {
  readonly data: DataView;
  readonly device: HIDDevice;
  readonly reportId: number;
}

interface HIDReportInfo {
  readonly reportId: number;
  readonly items: readonly unknown[];
}

interface HIDCollectionInfo {
  readonly usagePage: number;
  readonly usage: number;
  readonly inputReports: readonly HIDReportInfo[];
  readonly outputReports: readonly HIDReportInfo[];
  readonly featureReports: readonly HIDReportInfo[];
  readonly children?: readonly HIDCollectionInfo[];
}

interface HIDDevice extends EventTarget {
  readonly collections: readonly HIDCollectionInfo[];
  readonly opened: boolean;
  readonly productId: number;
  readonly productName: string;
  readonly vendorId: number;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport?(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport?(reportId: number): Promise<DataView>;
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}

interface Navigator {
  hid?: HID;
}
