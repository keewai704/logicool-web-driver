import { Send } from 'lucide-react';
import { useState } from 'react';
import type { HidppReportId } from '../hid/hidpp';
import { toHex } from '../hid/hidpp';
import type { DeviceSnapshot } from '../hid/superstrikeDriver';
import type { ProtocolLogEntry } from '../hid/webhidTransport';

export interface RawRequestInput {
  reportId: HidppReportId;
  deviceIndex: number;
  featureIndex: number;
  functionId: number;
  params: number[];
}

interface DiagnosticsPanelProps {
  busy: boolean;
  logs: ProtocolLogEntry[];
  snapshot: DeviceSnapshot | null;
  onRawRequest: (request: RawRequestInput) => void | Promise<void>;
}

export default function DiagnosticsPanel({ busy, logs, snapshot, onRawRequest }: DiagnosticsPanelProps) {
  const [reportId, setReportId] = useState<HidppReportId>(0x10);
  const [deviceIndex, setDeviceIndex] = useState('ff');
  const [featureIndex, setFeatureIndex] = useState('00');
  const [functionId, setFunctionId] = useState('00');
  const [params, setParams] = useState('');

  const rawRequest = parseRawRequest({ reportId, deviceIndex, featureIndex, functionId, params });

  return (
    <section className="panel diagnostics" aria-labelledby="diagnostics-heading">
      <h2 id="diagnostics-heading">Diagnostics</h2>
      <p className="muted">Raw requests are isolated from validated settings writes.</p>

      <div className="feature-list">
        {snapshot
          ? Object.values(snapshot.features).map((feature) =>
              feature ? (
                <div key={feature.name}>
                  <span>{feature.name}</span>
                  <code>{feature.supported ? `index 0x${feature.index.toString(16).padStart(2, '0')}` : 'unsupported'}</code>
                </div>
              ) : null,
            )
          : 'No feature snapshot yet.'}
      </div>

      <form
        className="raw-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (rawRequest.ok) {
            void onRawRequest(rawRequest.value);
          }
        }}
      >
        <label>
          Report
          <select value={reportId} onChange={(event) => setReportId(Number(event.target.value) as HidppReportId)}>
            <option value={0x10}>0x10</option>
            <option value={0x11}>0x11</option>
          </select>
        </label>
        <label>
          Device
          <input value={deviceIndex} onChange={(event) => setDeviceIndex(event.target.value)} />
        </label>
        <label>
          Feature index
          <input value={featureIndex} onChange={(event) => setFeatureIndex(event.target.value)} />
        </label>
        <label>
          Function
          <input value={functionId} onChange={(event) => setFunctionId(event.target.value)} />
        </label>
        <label className="wide-field">
          Params
          <input placeholder="00 01 02" value={params} onChange={(event) => setParams(event.target.value)} />
        </label>
        <button type="submit" disabled={busy || !rawRequest.ok}>
          <Send aria-hidden="true" size={18} />
          Send raw
        </button>
      </form>

      {!rawRequest.ok ? <p className="warning">{rawRequest.error}</p> : null}

      <div className="log-table" role="log" aria-label="HID protocol log">
        {logs.length === 0
          ? 'No HID traffic yet.'
          : logs.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`}>
                <span>{entry.direction === 'out' ? 'OUT' : 'IN'}</span>
                <code>{`0x${entry.reportId.toString(16)} ${entry.bytes}`}</code>
                {entry.note ? <small>{entry.note}</small> : null}
              </div>
            ))}
      </div>
    </section>
  );
}

function parseRawRequest(input: {
  reportId: HidppReportId;
  deviceIndex: string;
  featureIndex: string;
  functionId: string;
  params: string;
}): { ok: true; value: RawRequestInput } | { ok: false; error: string } {
  const deviceIndex = parseHexByte(input.deviceIndex);
  const featureIndex = parseHexByte(input.featureIndex);
  const functionId = parseHexByte(input.functionId);
  if (deviceIndex === null || featureIndex === null || functionId === null) {
    return { ok: false, error: 'Device, feature index, and function must be hex bytes.' };
  }

  const params: number[] = [];
  if (input.params.trim()) {
    for (const token of input.params.trim().split(/\s+/)) {
      const value = parseHexByte(token);
      if (value === null) {
        return { ok: false, error: 'Params must be space-separated hex bytes.' };
      }
      params.push(value);
    }
  }

  return {
    ok: true,
    value: {
      reportId: input.reportId,
      deviceIndex,
      featureIndex,
      functionId,
      params,
    },
  };
}

function parseHexByte(value: string): number | null {
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,2}$/i.test(normalized)) {
    return null;
  }
  return Number.parseInt(normalized, 16);
}

export function formatRawResponse(bytes: ArrayLike<number>): string {
  return toHex(bytes);
}
