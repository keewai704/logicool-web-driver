import { buildFeatureRequest, parseFeatureResponse, toHex, type HidppFeatureRequest, type HidppResponse } from './hidpp';

const LOGITECH_USB_RECEIVER_PRODUCT_ID = 0xc54d;

export interface ProtocolLogEntry {
  direction: 'out' | 'in';
  reportId: number;
  bytes: string;
  timestamp: string;
  note?: string;
}

interface PendingRequest {
  request: HidppFeatureRequest;
  resolve: (response: HidppResponse) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

export interface WebHidTransportOptions {
  timeoutMs?: number;
}

export async function requestLogitechDevice(hid: HID): Promise<HIDDevice | null> {
  const devices = await hid.requestDevice({
    filters: [
      { vendorId: 0x046d, usagePage: 0xff00, usage: 0x01 },
      { vendorId: 0x046d, usagePage: 0xff00, usage: 0x02 },
    ],
  });
  const hidppDevices = devices.filter(hasHidppShortReport);
  return hidppDevices.find((device) => device.productId !== LOGITECH_USB_RECEIVER_PRODUCT_ID) ?? hidppDevices[0] ?? null;
}

export class WebHidTransport {
  private readonly timeoutMs: number;
  private readonly pending: PendingRequest[] = [];
  private readonly logEntries: ProtocolLogEntry[] = [];
  private listening = false;

  constructor(
    private readonly device: HIDDevice,
    options: WebHidTransportOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 750;
  }

  get logs(): ProtocolLogEntry[] {
    return [...this.logEntries];
  }

  async request(request: HidppFeatureRequest): Promise<HidppResponse> {
    await this.ensureOpen();
    this.ensureListening();

    const payload = buildFeatureRequest(request);

    const responsePromise = new Promise<HidppResponse>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.removePending(pending);
        reject(new Error(`HID++ request timed out: report 0x${request.reportId.toString(16)} ${toHex(payload)}`));
      }, this.timeoutMs);

      const pending: PendingRequest = { request, resolve, reject, timeoutId };
      this.pending.push(pending);
    });

    const reportBuffer = new ArrayBuffer(payload.byteLength);
    new Uint8Array(reportBuffer).set(payload);

    this.log('out', request.reportId, payload);
    await this.device.sendReport(request.reportId, reportBuffer);
    return responsePromise;
  }

  private async ensureOpen(): Promise<void> {
    if (!this.device.opened) {
      await this.device.open();
    }
  }

  private ensureListening(): void {
    if (this.listening) {
      return;
    }

    this.device.addEventListener('inputreport', this.handleInputReport);
    this.listening = true;
  }

  private readonly handleInputReport = (event: HIDInputReportEvent): void => {
    const response = parseFeatureResponse(event.reportId, event.data);
    this.log('in', event.reportId, response.params, `header ${toHex([response.deviceIndex, response.featureIndex, response.functionId])}`);

    if (response.featureIndex === 0xff) {
      this.rejectMatchingErrorResponse(response);
      return;
    }

    const match = this.pending.find((pending) => isResponseForRequest(response, pending.request));
    if (!match) {
      return;
    }

    window.clearTimeout(match.timeoutId);
    this.removePending(match);
    match.resolve(response);
  };

  private removePending(pending: PendingRequest): void {
    const index = this.pending.indexOf(pending);
    if (index >= 0) {
      this.pending.splice(index, 1);
    }
  }

  private rejectMatchingErrorResponse(response: HidppResponse): void {
    const originalFeatureIndex = response.functionId;
    const originalFunctionId = response.params[0];
    const errorCode = response.params[1] ?? 0;
    const match = this.pending.find(
      (pending) =>
        response.reportId === pending.request.reportId &&
        response.deviceIndex === pending.request.deviceIndex &&
        originalFeatureIndex === pending.request.featureIndex &&
        originalFunctionId === pending.request.functionId,
    );

    if (!match) {
      return;
    }

    window.clearTimeout(match.timeoutId);
    this.removePending(match);
    match.reject(
      new Error(
        `HID++ error 0x${errorCode.toString(16).padStart(2, '0')} for feature 0x${originalFeatureIndex.toString(16)} function 0x${originalFunctionId.toString(16)}`,
      ),
    );
  }

  private log(direction: ProtocolLogEntry['direction'], reportId: number, bytes: ArrayLike<number>, note?: string): void {
    this.logEntries.push({
      direction,
      reportId,
      bytes: toHex(bytes),
      timestamp: new Date().toISOString(),
      note,
    });
  }
}

function isResponseForRequest(response: HidppResponse, request: HidppFeatureRequest): boolean {
  return (
    response.reportId === request.reportId &&
    response.deviceIndex === request.deviceIndex &&
    response.featureIndex === request.featureIndex &&
    response.functionId === request.functionId
  );
}

function hasHidppShortReport(device: HIDDevice): boolean {
  return device.collections.some((collection) => {
    const hasInput = collection.inputReports.some((report) => report.reportId === 0x10);
    const hasOutput = collection.outputReports.some((report) => report.reportId === 0x10);

    return collection.usagePage === 0xff00 && hasInput && hasOutput;
  });
}
