import { AlertTriangle, Cpu, Settings, Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import BackupPanel from './components/BackupPanel';
import ConnectionPanel from './components/ConnectionPanel';
import DiagnosticsPanel, { type RawRequestInput } from './components/DiagnosticsPanel';
import SuperstrikeSettings from './components/SuperstrikeSettings';
import type { ExtendedDpiSettings, ExtendedReportRate, OnboardMode, SuperstrikeSettings as SuperstrikeSettingsValue } from './hid/features';
import { SuperstrikeDriver, type DeviceSnapshot, type DriverDeviceInfo } from './hid/superstrikeDriver';
import { requestLogitechDevice, WebHidTransport, type ProtocolLogEntry } from './hid/webhidTransport';

type Tab = 'settings' | 'backup' | 'diagnostics';

export default function App() {
  const [busy, setBusy] = useState(false);
  const [driver, setDriver] = useState<SuperstrikeDriver | null>(null);
  const [device, setDevice] = useState<DriverDeviceInfo | null>(null);
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [status, setStatus] = useState('Connect a Logitech PRO X2 SUPERSTRIKE over USB or LIGHTSPEED receiver.');
  const [tab, setTab] = useState<Tab>('settings');
  const [logs, setLogs] = useState<ProtocolLogEntry[]>([]);

  const webHidSupported = typeof navigator !== 'undefined' && Boolean(navigator.hid);
  const unsupportedFeatures = useMemo(() => snapshot?.unsupportedFeatures ?? [], [snapshot]);

  async function runOperation(operation: () => Promise<void>, successMessage: string): Promise<void> {
    setBusy(true);
    try {
      await operation();
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect(): Promise<void> {
    await runOperation(async () => {
      if (!navigator.hid) {
        throw new Error('WebHID is not available in this browser.');
      }
      const hidDevice = await requestLogitechDevice(navigator.hid);
      if (!hidDevice) {
        throw new Error('No Logitech HID device was selected.');
      }

      const transport = new WebHidTransport(hidDevice);
      const info = {
        productName: hidDevice.productName,
        vendorId: hidDevice.vendorId,
        productId: hidDevice.productId,
      };
      const nextDriver = new SuperstrikeDriver(transport, info);
      const nextSnapshot = await nextDriver.readSnapshot();
      setDriver(nextDriver);
      setDevice(info);
      setSnapshot(nextSnapshot);
      setLogs(nextSnapshot.logs);
    }, 'Device connected and snapshot read.');
  }

  async function handleReadSnapshot(): Promise<void> {
    await runOperation(async () => {
      if (!driver) {
        throw new Error('Connect a device first.');
      }
      const nextSnapshot = await driver.readSnapshot();
      setSnapshot(nextSnapshot);
      setLogs(nextSnapshot.logs);
    }, 'Snapshot read. Export a backup before writing.');
  }

  async function refreshAfterWrite(message: string): Promise<void> {
    if (!driver) {
      throw new Error('Connect a device first.');
    }
    const nextSnapshot = await driver.readSnapshot();
    setSnapshot(nextSnapshot);
    setLogs(nextSnapshot.logs);
    setStatus(message);
  }

  async function handleWriteSuperstrike(settings: SuperstrikeSettingsValue): Promise<void> {
    await runOperation(async () => {
      if (!driver || !snapshot) {
        throw new Error('Read a snapshot before writing.');
      }
      await driver.writeSuperstrikeSettings(settings);
      await refreshAfterWrite('Superstrike tuning written and snapshot refreshed.');
    }, 'Superstrike tuning written and snapshot refreshed.');
  }

  async function handleWriteDpi(settings: ExtendedDpiSettings): Promise<void> {
    await runOperation(async () => {
      if (!driver || !snapshot) {
        throw new Error('Read a snapshot before writing.');
      }
      await driver.writeExtendedDpi(settings);
      await refreshAfterWrite('DPI settings written and snapshot refreshed.');
    }, 'DPI settings written and snapshot refreshed.');
  }

  async function handleWriteReportRate(rate: ExtendedReportRate): Promise<void> {
    await runOperation(async () => {
      if (!driver || !snapshot) {
        throw new Error('Read a snapshot before writing.');
      }
      await driver.writeExtendedReportRate(rate);
      await refreshAfterWrite('Report rate written and snapshot refreshed.');
    }, 'Report rate written and snapshot refreshed.');
  }

  async function handleWriteOnboardMode(mode: OnboardMode): Promise<void> {
    await runOperation(async () => {
      if (!driver || !snapshot) {
        throw new Error('Read a snapshot before writing.');
      }
      await driver.writeOnboardMode(mode);
      await refreshAfterWrite('Onboard mode written and snapshot refreshed.');
    }, 'Onboard mode written and snapshot refreshed.');
  }

  async function handleRawRequest(request: RawRequestInput): Promise<void> {
    await runOperation(async () => {
      if (!driver) {
        throw new Error('Connect a device first.');
      }
      await driver.rawRequest(request);
      const nextSnapshot = await driver.readSnapshot();
      setSnapshot(nextSnapshot);
      setLogs(nextSnapshot.logs);
    }, 'Raw request sent. Inspect the protocol log.');
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">WebHID configuration utility</p>
          <h1>Superstrike Web Driver</h1>
          <p>
            Direct HID++ controls for PRO X2 SUPERSTRIKE tuning, DPI, polling, onboard mode, and diagnostics.
          </p>
        </div>
        <Cpu aria-hidden="true" size={36} />
      </header>

      <ConnectionPanel
        busy={busy}
        device={device}
        snapshot={snapshot}
        status={status}
        webHidSupported={webHidSupported}
        onConnect={() => void handleConnect()}
        onReadSnapshot={() => void handleReadSnapshot()}
      />

      {unsupportedFeatures.length > 0 ? (
        <div className="notice">
          <AlertTriangle aria-hidden="true" size={18} />
          Unsupported features: {unsupportedFeatures.join(', ')}
        </div>
      ) : null}

      <nav className="tabs" aria-label="Views">
        <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          <Settings aria-hidden="true" size={18} />
          Settings
        </button>
        <button type="button" className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>
          Backup
        </button>
        <button type="button" className={tab === 'diagnostics' ? 'active' : ''} onClick={() => setTab('diagnostics')}>
          <Stethoscope aria-hidden="true" size={18} />
          Diagnostics
        </button>
      </nav>

      {tab === 'settings' ? (
        <SuperstrikeSettings
          busy={busy}
          snapshot={snapshot}
          onWriteDpi={(settings) => void handleWriteDpi(settings)}
          onWriteOnboardMode={(mode) => void handleWriteOnboardMode(mode)}
          onWriteReportRate={(rate) => void handleWriteReportRate(rate)}
          onWriteSuperstrike={(settings) => void handleWriteSuperstrike(settings)}
        />
      ) : null}

      {tab === 'backup' ? <BackupPanel snapshot={snapshot} /> : null}

      {tab === 'diagnostics' ? (
        <DiagnosticsPanel busy={busy} logs={logs} snapshot={snapshot} onRawRequest={(request) => void handleRawRequest(request)} />
      ) : null}
    </main>
  );
}
