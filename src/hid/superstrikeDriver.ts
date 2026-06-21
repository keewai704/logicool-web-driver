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
const TARGET_FEATURE_IDS = [
  FEATURE_IDS.SUPERSTRIKE_TUNING,
  FEATURE_IDS.EXTENDED_ADJUSTABLE_DPI,
  FEATURE_IDS.EXTENDED_ADJUSTABLE_REPORT_RATE,
  FEATURE_IDS.ONBOARD_PROFILES,
] as const;

export class SuperstrikeDriver {
  private features: FeatureSupportMap | null = null;

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

    const features: FeatureSupportMap = {};

    for (const featureId of TARGET_FEATURE_IDS) {
      const request: HidppFeatureRequest = {
        reportId: 0x10,
        deviceIndex: DEVICE_INDEX,
        featureIndex: 0x00,
        functionId: 0x00,
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
    const writes: Array<['left' | 'right', 'actuation' | 'rapidTrigger' | 'haptics', number]> = [
      ['left', 'actuation', settings.left.actuation],
      ['left', 'rapidTrigger', settings.left.rapidTrigger],
      ['left', 'haptics', settings.left.haptics],
      ['right', 'actuation', settings.right.actuation],
      ['right', 'rapidTrigger', settings.right.rapidTrigger],
      ['right', 'haptics', settings.right.haptics],
    ];

    for (const [button, key, value] of writes) {
      await this.transport.request({
        reportId: 0x10,
        deviceIndex: DEVICE_INDEX,
        featureIndex: feature.index,
        functionId: 0x20,
        params: encodeSuperstrikeWrite(button, key, value),
      });
    }
  }

  async writeExtendedDpi(settings: ExtendedDpiSettings): Promise<void> {
    const feature = await this.requireFeature('EXTENDED_ADJUSTABLE_DPI');
    await this.transport.request({
      reportId: 0x10,
      deviceIndex: DEVICE_INDEX,
      featureIndex: feature.index,
      functionId: 0x20,
      params: encodeExtendedDpi(settings),
    });
  }

  async writeExtendedReportRate(rate: ExtendedReportRate): Promise<void> {
    const feature = await this.requireFeature('EXTENDED_ADJUSTABLE_REPORT_RATE');
    await this.transport.request({
      reportId: 0x10,
      deviceIndex: DEVICE_INDEX,
      featureIndex: feature.index,
      functionId: 0x20,
      params: encodeExtendedReportRate(rate),
    });
  }

  async writeOnboardMode(mode: OnboardMode): Promise<void> {
    const feature = await this.requireFeature('ONBOARD_PROFILES');
    await this.transport.request({
      reportId: 0x10,
      deviceIndex: DEVICE_INDEX,
      featureIndex: feature.index,
      functionId: 0x10,
      params: encodeOnboardMode(mode),
    });
  }

  async rawRequest(request: HidppFeatureRequest): Promise<HidppResponse> {
    return this.transport.request(request);
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

    const [left, right] = await Promise.all([
      this.transport.request({
        reportId: 0x10,
        deviceIndex: DEVICE_INDEX,
        featureIndex: feature.index,
        functionId: 0x10,
        params: encodeSuperstrikeRead('left'),
      }),
      this.transport.request({
        reportId: 0x10,
        deviceIndex: DEVICE_INDEX,
        featureIndex: feature.index,
        functionId: 0x10,
        params: encodeSuperstrikeRead('right'),
      }),
    ]);

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

    const response = await this.transport.request({
      reportId: 0x10,
      deviceIndex: DEVICE_INDEX,
      featureIndex: feature.index,
      functionId: 0x10,
    });

    return decodeExtendedDpi(response.params);
  }

  private async readExtendedReportRateIfSupported(features: FeatureSupportMap): Promise<ExtendedReportRate | undefined> {
    const feature = features.EXTENDED_ADJUSTABLE_REPORT_RATE;
    if (!feature?.supported) {
      return undefined;
    }

    const response = await this.transport.request({
      reportId: 0x10,
      deviceIndex: DEVICE_INDEX,
      featureIndex: feature.index,
      functionId: 0x10,
    });

    return decodeExtendedReportRate(response.params);
  }

  private async readOnboardModeIfSupported(features: FeatureSupportMap): Promise<OnboardMode | undefined> {
    const feature = features.ONBOARD_PROFILES;
    if (!feature?.supported) {
      return undefined;
    }

    const response = await this.transport.request({
      reportId: 0x10,
      deviceIndex: DEVICE_INDEX,
      featureIndex: feature.index,
      functionId: 0x20,
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
