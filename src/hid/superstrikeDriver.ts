import { validateExtendedDpiSettings, validateSuperstrikeSettings } from '../domain/validation';
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
import {
  encodeOnboardReportRate,
  patchOnboardProfileSector,
  readOnboardProfileSettings,
  type OnboardProfileSettings,
} from './onboardProfiles';
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
const HIDPP_SHORT_REPORT_ID = 0x10;
const HIDPP_LONG_REPORT_ID = 0x11;
const SOFTWARE_ID = 0x08;
const FN_ROOT_GET_FEATURE = 0x00 | SOFTWARE_ID;
const FN_GET = 0x20 | SOFTWARE_ID;
const FN_SET = 0x10 | SOFTWARE_ID;
const FN_EXTENDED_DPI_GET = 0x50 | SOFTWARE_ID;
const FN_EXTENDED_DPI_SET = 0x60 | SOFTWARE_ID;
const FN_EXTENDED_REPORT_RATE_GET = 0x20 | SOFTWARE_ID;
const FN_EXTENDED_REPORT_RATE_SET = 0x30 | SOFTWARE_ID;
const FN_ONBOARD_INFO = 0x00 | SOFTWARE_ID;
const FN_ONBOARD_SELECT_PROFILE = 0x30 | SOFTWARE_ID;
const FN_ONBOARD_ACTIVE_PROFILE = 0x40 | SOFTWARE_ID;
const FN_ONBOARD_MEMORY_READ = 0x50 | SOFTWARE_ID;
const FN_ONBOARD_MEMORY_WRITE_START = 0x60 | SOFTWARE_ID;
const FN_ONBOARD_MEMORY_WRITE = 0x70 | SOFTWARE_ID;
const FN_ONBOARD_MEMORY_WRITE_END = 0x80 | SOFTWARE_ID;
const TARGET_FEATURE_IDS = [
  FEATURE_IDS.SUPERSTRIKE_TUNING,
  FEATURE_IDS.EXTENDED_ADJUSTABLE_DPI,
  FEATURE_IDS.EXTENDED_ADJUSTABLE_REPORT_RATE,
  FEATURE_IDS.ONBOARD_PROFILES,
] as const;

interface OnboardProfileInfo {
  profileCount: number;
  sectorSize: number;
}

interface OnboardProfileHeader {
  sector: number;
  enabled: boolean;
}

interface OnboardProfileTarget {
  feature: FeatureSupport;
  deviceIndex: number;
  sector: number;
  sectorSize: number;
}

export class SuperstrikeDriver {
  private features: FeatureSupportMap | null = null;
  private deviceIndex: number | null = null;

  constructor(
    private readonly transport: HidppTransport,
    private readonly device: DriverDeviceInfo,
  ) {}

  async readSnapshot(): Promise<DeviceSnapshot> {
    const features = await this.readFeatureSupport();
    const superstrike = await this.readSuperstrikeSettingsIfSupported(features);
    const liveDpi = await this.readExtendedDpiIfSupported(features);
    const liveReportRate = await this.readExtendedReportRateIfSupported(features);
    const onboardMode = await this.readOnboardModeIfSupported(features);
    const onboardProfile = onboardMode === 'onboard' ? await this.readOnboardProfileSettingsIfSupported(features) : undefined;

    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      device: this.device,
      features,
      unsupportedFeatures: unsupportedFeatureNames(features),
      superstrike,
      dpi: onboardProfile?.dpi ? { x: onboardProfile.dpi, y: onboardProfile.dpi, lod: liveDpi?.lod ?? 'HIGH' } : liveDpi,
      reportRate: onboardProfile?.reportRate ?? liveReportRate,
      onboardMode,
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
    const validation = validateExtendedDpiSettings(settings);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    if (await this.hasOnboardProfiles()) {
      if (settings.x !== settings.y) {
        throw new Error('Onboard profile DPI requires the same X and Y value.');
      }
      await this.writeActiveOnboardProfile({ dpi: settings.x });
      return;
    }

    const feature = await this.requireFeature('EXTENDED_ADJUSTABLE_DPI');
    const deviceIndex = await this.resolveDeviceIndex();

    await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_EXTENDED_DPI_SET,
      params: encodeExtendedDpi(settings),
    });
  }

  async writeExtendedReportRate(rate: ExtendedReportRate): Promise<void> {
    if (await this.hasOnboardProfiles()) {
      if (encodeOnboardReportRate(rate) === undefined) {
        throw new Error(`${rate} cannot persist in this onboard profile format. Use 1ms, 2ms, 4ms, or 8ms.`);
      }
      await this.writeActiveOnboardProfile({ reportRate: rate });
      return;
    }

    const feature = await this.requireFeature('EXTENDED_ADJUSTABLE_REPORT_RATE');
    const deviceIndex = await this.resolveDeviceIndex();
    await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_EXTENDED_REPORT_RATE_SET,
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

  private async hasOnboardProfiles(): Promise<boolean> {
    const features = await this.readFeatureSupport();
    const feature = features.ONBOARD_PROFILES;
    return Boolean(feature?.supported);
  }

  private async writeActiveOnboardProfile(patch: Parameters<typeof patchOnboardProfileSector>[1]): Promise<void> {
    const target = await this.readActiveOnboardProfileTarget();
    const current = await this.readOnboardSector(target.feature, target.deviceIndex, target.sector, target.sectorSize);
    const next = patchOnboardProfileSector(current, patch);

    if (!bytesEqual(current, next)) {
      await this.writeOnboardSector(target.feature, target.deviceIndex, target.sector, next);
    }

    await this.activateOnboardProfile(target.feature, target.deviceIndex, target.sector);
  }

  private async readActiveOnboardProfileTarget(): Promise<OnboardProfileTarget> {
    const feature = await this.requireFeature('ONBOARD_PROFILES');
    const deviceIndex = await this.resolveDeviceIndex();
    const info = await this.readOnboardProfileInfo(feature, deviceIndex);
    const headers = await this.readOnboardProfileHeaders(feature, deviceIndex, info.profileCount);
    const activeSector = await this.readActiveOnboardProfileSector(feature, deviceIndex).catch(() => undefined);
    const header = headers.find((candidate) => candidate.enabled && candidate.sector === activeSector) ?? headers.find((candidate) => candidate.enabled) ?? headers[0];

    if (!header) {
      throw new Error('No onboard profile sector was found.');
    }
    if (header.sector >= 0x0100) {
      throw new Error(`Onboard profile sector 0x${header.sector.toString(16)} is read-only.`);
    }

    return {
      feature,
      deviceIndex,
      sector: header.sector,
      sectorSize: info.sectorSize,
    };
  }

  private async readOnboardProfileInfo(feature: FeatureSupport, deviceIndex: number): Promise<OnboardProfileInfo> {
    const response = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_ONBOARD_INFO,
    });

    if (response.params[0] !== 0x01) {
      throw new Error(`Unsupported onboard profile memory model 0x${response.params[0]?.toString(16) ?? '??'}.`);
    }

    const sectorSize = readUint16Be(response.params, 7);
    if (sectorSize < 16) {
      throw new Error(`Invalid onboard profile sector size ${sectorSize}.`);
    }

    return {
      profileCount: response.params[3] ?? 0,
      sectorSize,
    };
  }

  private async readOnboardProfileHeaders(feature: FeatureSupport, deviceIndex: number, profileCount: number): Promise<OnboardProfileHeader[]> {
    const headers: OnboardProfileHeader[] = [];
    let directorySector = 0x0000;
    let offset = 0;
    let chunk = await this.readOnboardSectorChunk(feature, deviceIndex, directorySector, offset);

    if (isBlankDirectoryChunk(chunk)) {
      directorySector = 0x0100;
      chunk = await this.readOnboardSectorChunk(feature, deviceIndex, directorySector, offset);
    }

    while (headers.length < profileCount) {
      for (let entryOffset = 0; entryOffset < 16 && headers.length < profileCount; entryOffset += 4) {
        const sector = readUint16Be(chunk, entryOffset);
        if (sector === 0xffff) {
          return headers;
        }

        headers.push({
          sector,
          enabled: chunk[entryOffset + 2] !== 0,
        });
      }

      offset += 16;
      chunk = await this.readOnboardSectorChunk(feature, deviceIndex, directorySector, offset);
    }

    return headers;
  }

  private async readActiveOnboardProfileSector(feature: FeatureSupport, deviceIndex: number): Promise<number> {
    const response = await this.transport.request({
      reportId: HIDPP_SHORT_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_ONBOARD_ACTIVE_PROFILE,
    });

    return readUint16Be(response.params, 0);
  }

  private async readOnboardProfileSettingsIfSupported(features: FeatureSupportMap): Promise<OnboardProfileSettings | undefined> {
    const feature = features.ONBOARD_PROFILES;
    if (!feature?.supported) {
      return undefined;
    }

    try {
      const target = await this.readActiveOnboardProfileTarget();
      const sector = await this.readOnboardSector(target.feature, target.deviceIndex, target.sector, target.sectorSize);
      return readOnboardProfileSettings(sector);
    } catch {
      return undefined;
    }
  }

  private async readOnboardSector(
    feature: FeatureSupport,
    deviceIndex: number,
    sector: number,
    sectorSize: number,
  ): Promise<Uint8Array> {
    const data = new Uint8Array(sectorSize);

    for (let offset = 0; offset < sectorSize; offset += 16) {
      const readOffset = sectorSize - offset < 16 ? sectorSize - 16 : offset;
      const chunk = await this.readOnboardSectorChunk(feature, deviceIndex, sector, readOffset);
      data.set(chunk.slice(0, Math.min(16, sectorSize - readOffset)), readOffset);
    }

    return data;
  }

  private async readOnboardSectorChunk(
    feature: FeatureSupport,
    deviceIndex: number,
    sector: number,
    offset: number,
  ): Promise<Uint8Array> {
    const response = await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_ONBOARD_MEMORY_READ,
      params: [(sector >> 8) & 0xff, sector & 0xff, (offset >> 8) & 0xff, offset & 0xff],
    });

    return response.params.slice(0, 16);
  }

  private async writeOnboardSector(
    feature: FeatureSupport,
    deviceIndex: number,
    sector: number,
    sectorBytes: Uint8Array,
  ): Promise<void> {
    await this.transport.request({
      reportId: HIDPP_LONG_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_ONBOARD_MEMORY_WRITE_START,
      params: [(sector >> 8) & 0xff, sector & 0xff, 0x00, 0x00, (sectorBytes.length >> 8) & 0xff, sectorBytes.length & 0xff],
    });

    for (let offset = 0; offset < sectorBytes.length - 1; offset += 16) {
      await this.transport.request({
        reportId: HIDPP_LONG_REPORT_ID,
        deviceIndex,
        featureIndex: feature.index,
        functionId: FN_ONBOARD_MEMORY_WRITE,
        params: Array.from(sectorBytes.slice(offset, offset + 16)),
      });
    }

    await this.transport.request({
      reportId: HIDPP_SHORT_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_ONBOARD_MEMORY_WRITE_END,
    });
  }

  private async activateOnboardProfile(feature: FeatureSupport, deviceIndex: number, sector: number): Promise<void> {
    await this.transport.request({
      reportId: HIDPP_SHORT_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_SET,
      params: encodeOnboardMode('onboard'),
    });
    await this.transport.request({
      reportId: HIDPP_SHORT_REPORT_ID,
      deviceIndex,
      featureIndex: feature.index,
      functionId: FN_ONBOARD_SELECT_PROFILE,
      params: [(sector >> 8) & 0xff, sector & 0xff],
    });
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
      functionId: FN_EXTENDED_DPI_GET,
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
      functionId: FN_EXTENDED_REPORT_RATE_GET,
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

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function isBlankDirectoryChunk(chunk: Uint8Array): boolean {
  const firstEntry = Array.from(chunk.slice(0, 4));
  return firstEntry.every((byte) => byte === 0x00) || firstEntry.every((byte) => byte === 0xff);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((byte, index) => byte === right[index]);
}
