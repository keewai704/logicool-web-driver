import type { ExtendedReportRate } from './features';

export interface OnboardProfileSettings {
  dpi?: number;
  reportRate?: ExtendedReportRate;
}

export interface OnboardProfilePatch {
  dpi?: number;
  reportRate?: ExtendedReportRate;
}

const ONBOARD_DPI_COUNT = 5;
const ONBOARD_DPI_OFFSET = 3;

const ONBOARD_REPORT_RATE_MS: Partial<Record<ExtendedReportRate, number>> = {
  '8ms': 8,
  '4ms': 4,
  '2ms': 2,
  '1ms': 1,
};

const REPORT_RATE_BY_ONBOARD_MS: Record<number, ExtendedReportRate> = {
  8: '8ms',
  4: '4ms',
  2: '2ms',
  1: '1ms',
};

export function encodeOnboardReportRate(rate: ExtendedReportRate): number | undefined {
  return ONBOARD_REPORT_RATE_MS[rate];
}

export function readOnboardProfileSettings(sector: Uint8Array): OnboardProfileSettings {
  assertSectorCanHoldProfileBasics(sector);

  const defaultIndex = sector[1] < ONBOARD_DPI_COUNT ? sector[1] : 0;
  const defaultDpi = readUint16Le(sector, ONBOARD_DPI_OFFSET + defaultIndex * 2);
  const fallbackDpi = readFirstUsableDpi(sector);

  return {
    dpi: isUsableDpi(defaultDpi) ? defaultDpi : fallbackDpi,
    reportRate: REPORT_RATE_BY_ONBOARD_MS[sector[0]],
  };
}

export function patchOnboardProfileSector(sector: Uint8Array, patch: OnboardProfilePatch): Uint8Array {
  assertSectorCanHoldProfileBasics(sector);

  const next = sector.slice();
  if (patch.reportRate) {
    const reportRate = encodeOnboardReportRate(patch.reportRate);
    if (reportRate === undefined) {
      throw new Error(`${patch.reportRate} cannot persist in this onboard profile format.`);
    }
    next[0] = reportRate;
  }

  if (patch.dpi !== undefined) {
    for (let index = 0; index < ONBOARD_DPI_COUNT; index += 1) {
      writeUint16Le(next, ONBOARD_DPI_OFFSET + index * 2, patch.dpi);
    }
  }

  return updateOnboardProfileSectorCrc(next);
}

export function updateOnboardProfileSectorCrc(sector: Uint8Array): Uint8Array {
  if (sector.length < 2) {
    throw new Error('Onboard profile sector is too short for CRC.');
  }

  const next = sector.slice();
  const crc = crc16Ccitt(next.slice(0, -2));
  next[next.length - 2] = (crc >> 8) & 0xff;
  next[next.length - 1] = crc & 0xff;
  return next;
}

export function isOnboardProfileSectorCrcValid(sector: Uint8Array): boolean {
  if (sector.length < 2) {
    return false;
  }

  const actual = readUint16Be(sector, sector.length - 2);
  return crc16Ccitt(sector.slice(0, -2)) === actual;
}

export function crc16Ccitt(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function assertSectorCanHoldProfileBasics(sector: Uint8Array): void {
  if (sector.length < ONBOARD_DPI_OFFSET + ONBOARD_DPI_COUNT * 2 + 2) {
    throw new Error(`Onboard profile sector is too short: ${sector.length} bytes.`);
  }
}

function readFirstUsableDpi(sector: Uint8Array): number | undefined {
  for (let index = 0; index < ONBOARD_DPI_COUNT; index += 1) {
    const dpi = readUint16Le(sector, ONBOARD_DPI_OFFSET + index * 2);
    if (isUsableDpi(dpi)) {
      return dpi;
    }
  }
  return undefined;
}

function isUsableDpi(dpi: number): boolean {
  return dpi > 0 && dpi !== 0xffff;
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function writeUint16Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}
