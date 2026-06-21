import { Cable, RefreshCw, Search } from 'lucide-react';
import type { DeviceSnapshot, DriverDeviceInfo } from '../hid/superstrikeDriver';

interface ConnectionPanelProps {
  busy: boolean;
  device: DriverDeviceInfo | null;
  snapshot: DeviceSnapshot | null;
  status: string;
  webHidSupported: boolean;
  onConnect: () => void;
  onReadSnapshot: () => void;
}

export default function ConnectionPanel({
  busy,
  device,
  snapshot,
  status,
  webHidSupported,
  onConnect,
  onReadSnapshot,
}: ConnectionPanelProps) {
  return (
    <section className="panel connection-panel" aria-labelledby="connection-heading">
      <div>
        <h2 id="connection-heading">Device</h2>
        <p className="muted">{status}</p>
      </div>

      <div className="button-row">
        <button className="primary-button" type="button" onClick={onConnect} disabled={busy || !webHidSupported}>
          <Cable aria-hidden="true" size={18} />
          Connect
        </button>
        <button type="button" onClick={onReadSnapshot} disabled={busy || !device}>
          <RefreshCw aria-hidden="true" size={18} />
          Read
        </button>
      </div>

      <dl className="device-grid">
        <div>
          <dt>Name</dt>
          <dd>{device?.productName ?? 'Not connected'}</dd>
        </div>
        <div>
          <dt>VID:PID</dt>
          <dd>
            {device
              ? `${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}`
              : '----:----'}
          </dd>
        </div>
        <div>
          <dt>Snapshot</dt>
          <dd>{snapshot ? new Date(snapshot.capturedAt).toLocaleString() : 'None'}</dd>
        </div>
      </dl>

      {!webHidSupported ? (
        <p className="warning">
          <Search aria-hidden="true" size={16} />
          WebHID is not available in this browser. Use Chromium or Chrome on localhost.
        </p>
      ) : null}
    </section>
  );
}
