export const FEATURE_IDS = {
  ROOT: 0x0000,
  FEATURE_SET: 0x0001,
  SUPERSTRIKE_TUNING: 0x1b0c,
  EXTENDED_ADJUSTABLE_DPI: 0x2202,
  EXTENDED_ADJUSTABLE_REPORT_RATE: 0x8061,
  ONBOARD_PROFILES: 0x8100,
} as const;

export const FEATURE_NAMES_BY_ID = new Map<number, string>(
  Object.entries(FEATURE_IDS).map(([name, id]) => [id, name]),
);

export type SuperstrikeButton = 'left' | 'right';

export interface SuperstrikeButtonSettings {
  actuation: number;
  rapidTrigger: number;
  haptics: number;
}

export interface SuperstrikeSettings {
  left: SuperstrikeButtonSettings;
  right: SuperstrikeButtonSettings;
}

export type LodSetting = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExtendedDpiSettings {
  x: number;
  y: number;
  lod: LodSetting;
}

export type ExtendedReportRate = '8ms' | '4ms' | '2ms' | '1ms' | '500us' | '250us' | '125us';
export type OnboardMode = 'no-change' | 'onboard' | 'host';

export interface DecodedSuperstrikeRead {
  button: SuperstrikeButton;
  settings: SuperstrikeButtonSettings;
}

const BUTTON_INDEX: Record<SuperstrikeButton, number> = {
  left: 0x00,
  right: 0x01,
};

const BUTTON_BY_INDEX: Record<number, SuperstrikeButton> = {
  0x00: 'left',
  0x01: 'right',
};

const LOD_VALUE: Record<LodSetting, number> = {
  LOW: 0x00,
  MEDIUM: 0x01,
  HIGH: 0x02,
};

const LOD_BY_VALUE: Record<number, LodSetting> = {
  0x00: 'LOW',
  0x01: 'MEDIUM',
  0x02: 'HIGH',
};

export const EXTENDED_REPORT_RATE_VALUE: Record<ExtendedReportRate, number> = {
  '8ms': 0x00,
  '4ms': 0x01,
  '2ms': 0x02,
  '1ms': 0x03,
  '500us': 0x04,
  '250us': 0x05,
  '125us': 0x06,
};

const EXTENDED_REPORT_RATE_BY_VALUE = Object.fromEntries(
  Object.entries(EXTENDED_REPORT_RATE_VALUE).map(([name, value]) => [value, name]),
) as Record<number, ExtendedReportRate>;

const ONBOARD_MODE_VALUE: Record<OnboardMode, number> = {
  'no-change': 0x00,
  onboard: 0x01,
  host: 0x02,
};

const ONBOARD_MODE_BY_VALUE: Record<number, OnboardMode> = {
  0x00: 'no-change',
  0x01: 'onboard',
  0x02: 'host',
};

export function encodeSuperstrikeWrite(
  button: SuperstrikeButton,
  settings: SuperstrikeButtonSettings,
  currentRapidTriggerWireValue: number,
): number[] {
  return [
    BUTTON_INDEX[button],
    settings.actuation << 2,
    (settings.rapidTrigger << 2) | (currentRapidTriggerWireValue & 0x01),
    settings.haptics << 2,
  ];
}

export function encodeSuperstrikeRead(button: SuperstrikeButton): number[] {
  return [BUTTON_INDEX[button]];
}

export function decodeSuperstrikeRead(params: Uint8Array): DecodedSuperstrikeRead {
  const button = BUTTON_BY_INDEX[params[0]];

  if (!button) {
    throw new Error(`Unknown Superstrike button index ${params[0]}`);
  }

  return {
    button,
    settings: {
      actuation: params[1] >> 2,
      rapidTrigger: params[2] >> 2,
      haptics: params[3] >> 2,
    },
  };
}

export function encodeExtendedDpi(settings: ExtendedDpiSettings): number[] {
  return [
    0x00,
    (settings.x >> 8) & 0xff,
    settings.x & 0xff,
    (settings.y >> 8) & 0xff,
    settings.y & 0xff,
    LOD_VALUE[settings.lod],
  ];
}

export function decodeExtendedDpi(params: Uint8Array): ExtendedDpiSettings {
  if (params.length < 10) {
    throw new Error(`Extended DPI response is too short: ${params.length} bytes`);
  }

  const currentX = readUint16(params, 1);
  const defaultX = readUint16(params, 3);
  const currentY = readUint16(params, 5);
  const defaultY = readUint16(params, 7);
  const lod = LOD_BY_VALUE[params[9]];

  if (!lod) {
    throw new Error(`Unknown LOD value ${params[9]}`);
  }

  return {
    x: currentX === 0 ? defaultX : currentX,
    y: currentY === 0 ? defaultY : currentY,
    lod,
  };
}

export function encodeExtendedReportRate(value: ExtendedReportRate): number[] {
  return [EXTENDED_REPORT_RATE_VALUE[value]];
}

export function decodeExtendedReportRate(params: Uint8Array): ExtendedReportRate {
  const rate = EXTENDED_REPORT_RATE_BY_VALUE[params[0]];

  if (!rate) {
    throw new Error(`Unknown extended report rate value ${params[0]}`);
  }

  return rate;
}

export function encodeOnboardMode(value: OnboardMode): number[] {
  return [ONBOARD_MODE_VALUE[value]];
}

export function decodeOnboardMode(params: Uint8Array): OnboardMode {
  const mode = ONBOARD_MODE_BY_VALUE[params[0]];

  if (!mode) {
    throw new Error(`Unknown onboard mode value ${params[0]}`);
  }

  return mode;
}

function readUint16(params: Uint8Array, offset: number): number {
  return (params[offset] << 8) | params[offset + 1];
}
