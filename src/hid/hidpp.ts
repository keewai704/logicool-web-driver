export type HidppReportId = 0x10 | 0x11;

export interface HidppFeatureRequest {
  reportId: HidppReportId;
  deviceIndex: number;
  featureIndex: number;
  functionId: number;
  params?: readonly number[];
}

export interface HidppResponse {
  reportId: number;
  deviceIndex: number;
  featureIndex: number;
  functionId: number;
  params: Uint8Array;
}

const SHORT_PAYLOAD_LENGTH = 6;
const LONG_PAYLOAD_LENGTH = 19;

export function buildFeatureRequest(request: HidppFeatureRequest): Uint8Array {
  const length = request.reportId === 0x10 ? SHORT_PAYLOAD_LENGTH : LONG_PAYLOAD_LENGTH;
  const packet = new Uint8Array(length);

  packet[0] = request.deviceIndex & 0xff;
  packet[1] = request.featureIndex & 0xff;
  packet[2] = request.functionId & 0xff;

  for (const [index, value] of (request.params ?? []).entries()) {
    if (index + 3 >= length) {
      throw new Error(`HID++ request has too many params for report 0x${request.reportId.toString(16)}`);
    }
    packet[index + 3] = value & 0xff;
  }

  return packet;
}

export function parseFeatureResponse(reportId: number, data: DataView | Uint8Array): HidppResponse {
  const bytes = data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;

  if (bytes.length < 3) {
    throw new Error('HID++ response is shorter than the 3-byte header');
  }

  return {
    reportId,
    deviceIndex: bytes[0],
    featureIndex: bytes[1],
    functionId: bytes[2],
    params: bytes.slice(3),
  };
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
