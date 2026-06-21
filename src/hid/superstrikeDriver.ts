import { validateSuperstrikeSettings } from '../domain/validation';
import {
  FEATURE_IDS,
  FEATURE_NAMES_BY_ID,
  decodeExtendedDpi,
  decodeExtendedReportRate,
  decodeOnboardMode,
  decodeSuperstrikeRead,
  encodeExtendedDpi,
  encodeExtendedReportRate,
  encodeOnboardMode,
  encodeSuperstrikeRead,
  encodeSuperstrikeWrite,
  type ExtendedDpiSettings,
  type ExtendedReportRate,
  type OnboardMode,
  type SuperstrikeSettings,
} from './features';
import type { HidppFeatureRequest, HidppResponse } from './hidpp';
import type { ProtocolLogEntry } from './webhidTransport';

export interface HidppTransport {
  request(request: HidppFeatureRequest): Promise<HidppResponse>;
  readonly logs?: ProtocolLogEntry[];
}

export interface DriverDeviceInfo {
  productName: string;
  vendorId: number;
  productId: number;
}

export interface FeatureSupport {
  id: number;
  name: string;
  index: number;
  flags: number;
  version: number;
  supported: boolean;
}

export type FeatureSupportMap = Record<string, FeatureSupport | undefined>;

export interface DeviceSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  device: DriverDeviceInfo;
  features: FeatureSupportMap;
  unsupportedFeatures: string[];
  superstrike?: SuperstrikeSettings;
  dpi?: ExtendedDpiSettings;
  reportRate?: ExtendedReportRate;
  onboardMode?: OnboardMode;
  logs: ProtocolLogEntry[];
}

const DEVICE_INDEX = 0xff;
const WIRELESS_DEVICE_INDEX = 0x01;
const HIDPP_LONG_REPORT_ID = 0x11;
const SOFTWARE_ID = 0x08;
const FN_ROOT_GET_FEATURE = 0x00 | SOFTWARE_ID;
const FN_GET = 0x20 | SOFTWARE_ID;
const FN_SET = 0x10 | SOFTWARE_ID;
const TARGET_FEATURE_IDS = [
  FEATURE_IDS.SUPERSTRIKE_TUNING,
  FEATURE_IDS.EXTENDED_ADJUSTABLE_DPI,
  FEATURE_IDS.EXTENDED_ADJUSTABLE_REPORT_RATE,
  FEATURE_IDS.ONBOARD_PROFILES,
] as const;

export class SuperstrikeDriver {
  private features: FeatureSupportMap | null = null;
  private deviceIndex: number | null = null;

  constructor(
    private readonly transport: HidppTransport,
    private readonly device: DriverDeviceInfo,
  ) {}

  async readSnapshot(): Promise<DeviceSnapshot> {
    const features = await this.readFeatureSupport();

    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      device: this.device,
      features,
      unsupportedFeatures: unsupportedFeatureNames(features),
      superstrike: await this.readSuperstrikeSettingsIfSupported(features),
      dpi: await this.readExtendedDpiIfSupported(features),
      reportRate: await this.readExtendedReportRateIfSupported(features),
      onboardMode: await this.readOnboardModeIfSupported(features),
      logs: this.transport.logs ?? [],
    };
  }

  async readFeatureSupport(): Promise<FeatureSupportMap> {
    if (this.features) {
      return this.features;
    }

    const deviceIndex = await this.resolveDeviceIndex();
    const features: FeatureSupportMap = {};

    for (const featureId of TARGET_FEATURE_IDS) {
      const request: HidppFeatureRequest = {
        reportId: HIDPP_LONG_REPORT_ID,
        deviceIndex,
        featureIndex: 0x00,
        functionId: FN_ROOT_GET_FEATURE,
        params: [(featureId >> 8) & 0xff, featureId & 0xff],
      };
      const response = await this.transport.request(request);
      const name = FEATURE_NAMES_BY_ID.get(featureId) ?? `UNKNOWN_${featureId.toString(16).toUpperCase()}`;
      const index = response.params[0] ?? 0;

      features[name] = {
        id: featureId,
        name,
        index,
        flags: response.params[1] ?? 0,
        version: response.params[2] ?? 0,
        supported: index !== 0,
      };
    }

    this.features = features;
    return features;
  }

  async writeSuperstrikeSettings(settings: SuperstrikeSettings): Promise<void> {
    const validation = validateSuperstrikeSettings(settings);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    const feature = await this.requireFeature('SUPERSTRIKE_TUNING');
    const deviceIndex = await this.resolveDeviceIndex();

    for (const button of ['left', 'right'] as const) {
      const current = await this.transport.request({
        reportId: HIDPP_LONG_REPORT_ID,
        deviceIndex,
        featureIndex: feature.index,
        functionId: FN_GET,
        params: encodeSuperstrikeRead(button),
      });

      await this.transport.request({
        reportId: HIDPP_LONG_REPORT_ID,
        deviceIndex,
        featureIndex: feature.index,
        functionId: FN_SET,
        params: encodeSuperstrikeWrite(button, settings[button], current.params[2] ?? 0),
      });
    }
  }

  async writeExtendedDpi(settings: ExtendedDpiSettings): Promise<void> {
    const feature = await this.requireFeature('EXTENDED_ADJUSTABLE_DPI');
    const deviceIndex = await this.resolveDeviceIndex();
    await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_SET,
      params: encodeExtendedDpi(settings),
    });
  }

  async writeExtendedReportRate(rate: ExtendedReportRate): Promise<void> {
    const feature = await this.requireFeature('EXTENDED_ADJUSTABLE_REPORT_RATE');
    const deviceIndex = await this.resolveDeviceIndex();
    await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_SET,
      params: encodeExtendedReportRate(rate),
    });
  }

  async writeOnboardMode(mode: OnboardMode): Promise<void> {
    const feature = await this.requireFeature('ONBOARD_PROFILES');
    const deviceIndex = await this.resolveDeviceIndex();
    await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_SET,
      params: encodeOnboardMode(mode),
    });
  }

  async rawRequest(request: HidppFeatureRequest): Promise<HidppResponse> {
    return this.transport.request(request);
  }

  private async resolveDeviceIndex(): Promise<number> {
    if (this.deviceIndex !== null) {
      return this.deviceIndex;
    }

    const candidateIndexes = [WIRELESS_DEVICE_INDEX, DEVICE_INDEX];
    let lastError: unknown = null;

    for (const deviceIndex of candidateIndexes) {
      try {
        const response = await this.transport.request({
          reportId: HIDPP_LONG_REPORT_ID,
          deviceIndex,
          featureIndex: 0x00,
          functionId: FN_ROOT_GET_FEATURE,
          params: [(FEATURE_IDS.FEATURE_SET >> 8) & 0xff, FEATURE_IDS.FEATURE_SET & 0xff],
        });
        this.deviceIndex = response.deviceIndex;
        return this.deviceIndex;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Unable to resolve HID++ device index.');
  }

  private async requireFeature(name: string): Promise<FeatureSupport> {
    const features = await this.readFeatureSupport();
    const feature = features[name];

    if (!feature?.supported) {
      throw new Error(`${name} is not supported by this device.`);
    }

    return feature;
  }

  private async readSuperstrikeSettingsIfSupported(features: FeatureSupportMap): Promise<SuperstrikeSettings | undefined> {
    const feature = features.SUPERSTRIKE_TUNING;
    if (!feature?.supported) {
      return undefined;
    }

    const deviceIndex = await this.resolveDeviceIndex();
    const left = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_GET,
      params: encodeSuperstrikeRead('left'),
    });
    const right = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_GET,
      params: encodeSuperstrikeRead('right'),
    });

    const leftDecoded = decodeSuperstrikeRead(left.params);
    const rightDecoded = decodeSuperstrikeRead(right.params);

    return {
      left: leftDecoded.settings,
      right: rightDecoded.settings,
    };
  }

  private async readExtendedDpiIfSupported(features: FeatureSupportMap): Promise<ExtendedDpiSettings | undefined> {
    const feature = features.EXTENDED_ADJUSTABLE_DPI;
    if (!feature?.supported) {
      return undefined;
    }

    const deviceIndex = await this.resolveDeviceIndex();
    const response = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: 0x10 | SOFTWARE_ID,
    });

    return decodeExtendedDpi(response.params);
  }

  private async readExtendedReportRateIfSupported(features: FeatureSupportMap): Promise<ExtendedReportRate | undefined> {
    const feature = features.EXTENDED_ADJUSTABLE_REPORT_RATE;
    if (!feature?.supported) {
      return undefined;
    }

    const deviceIndex = await this.resolveDeviceIndex();
    const response = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: 0x10 | SOFTWARE_ID,
    });

    return decodeExtendedReportRate(response.params);
  }

  private async readOnboardModeIfSupported(features: FeatureSupportMap): Promise<OnboardMode | undefined> {
    const feature = features.ONBOARD_PROFILES;
    if (!feature?.supported) {
      return undefined;
    }

    const deviceIndex = await this.resolveDeviceIndex();
    const response = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_GET,
    });

    return decodeOnboardMode(response.params);
  }
}

function unsupportedFeatureNames(features: FeatureSupportMap): string[] {
  return Object.values(features)
    .filter((feature): feature is FeatureSupport => feature !== undefined)
    .filter((feature) => !feature.supported)
    .map((feature) => feature.name);
}
