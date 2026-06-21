import { Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { validateSuperstrikeSettings } from '../domain/validation';
import type {
  ExtendedDpiSettings,
  ExtendedReportRate,
  OnboardMode,
  SuperstrikeButton,
  SuperstrikeButtonSettings,
  SuperstrikeSettings as SuperstrikeSettingsValue,
} from '../hid/features';
import type { DeviceSnapshot } from '../hid/superstrikeDriver';

interface SuperstrikeSettingsProps {
  busy: boolean;
  snapshot: DeviceSnapshot | null;
  onWriteSuperstrike: (settings: SuperstrikeSettingsValue) => void | Promise<void>;
  onWriteDpi: (settings: ExtendedDpiSettings) => void | Promise<void>;
  onWriteReportRate: (rate: ExtendedReportRate) => void | Promise<void>;
  onWriteOnboardMode: (mode: OnboardMode) => void | Promise<void>;
}

const DEFAULT_TUNING: SuperstrikeSettingsValue = {
  left: { actuation: 5, rapidTrigger: 3, haptics: 3 },
  right: { actuation: 5, rapidTrigger: 3, haptics: 3 },
};

const DEFAULT_DPI: ExtendedDpiSettings = { x: 1600, y: 1600, lod: 'HIGH' };
const REPORT_RATES: ExtendedReportRate[] = ['8ms', '4ms', '2ms', '1ms', '500us', '250us', '125us'];

export default function SuperstrikeSettings({
  busy,
  snapshot,
  onWriteDpi,
  onWriteOnboardMode,
  onWriteReportRate,
  onWriteSuperstrike,
}: SuperstrikeSettingsProps) {
  const [tuning, setTuning] = useState<SuperstrikeSettingsValue>(DEFAULT_TUNING);
  const [dpi, setDpi] = useState<ExtendedDpiSettings>(DEFAULT_DPI);
  const [reportRate, setReportRate] = useState<ExtendedReportRate>('1ms');
  const [onboardMode, setOnboardMode] = useState<OnboardMode>('host');

  useEffect(() => {
    if (snapshot?.superstrike) {
      setTuning(snapshot.superstrike);
    }
    if (snapshot?.dpi) {
      setDpi(snapshot.dpi);
    }
    if (snapshot?.reportRate) {
      setReportRate(snapshot.reportRate);
    }
    if (snapshot?.onboardMode) {
      setOnboardMode(snapshot.onboardMode);
    }
  }, [snapshot]);

  const validation = useMemo(() => validateSuperstrikeSettings(tuning), [tuning]);
  const hasSnapshot = Boolean(snapshot);
  const canWriteTuning = hasSnapshot && Boolean(snapshot?.superstrike) && validation.ok && !busy;

  return (
    <section className="panel" aria-labelledby="settings-heading">
      <div className="panel-heading">
        <div>
          <h2 id="settings-heading">Settings</h2>
          <p className="muted">Validated controls write known HID++ features only.</p>
        </div>
        <SlidersHorizontal aria-hidden="true" size={22} />
      </div>

      {!hasSnapshot ? <p className="warning">Read the device before writing settings.</p> : null}

      <div className="settings-grid">
        <fieldset className="fieldset">
          <legend>Click tuning</legend>
          <div className="two-column">
            <ButtonTuningEditor button="left" value={tuning.left} onChange={(left) => setTuning({ ...tuning, left })} />
            <ButtonTuningEditor
              button="right"
              value={tuning.right}
              onChange={(right) => setTuning({ ...tuning, right })}
            />
          </div>

          {validation.errors.length > 0 ? (
            <ul className="error-list">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <button type="button" onClick={() => onWriteSuperstrike(tuning)} disabled={!canWriteTuning}>
            <Save aria-hidden="true" size={18} />
            Write tuning
          </button>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Sensor</legend>
          <label>
            DPI X
            <input
              type="number"
              min="100"
              max="44000"
              step="50"
              value={dpi.x}
              onChange={(event) => setDpi({ ...dpi, x: Number(event.target.value) })}
            />
          </label>
          <label>
            DPI Y
            <input
              type="number"
              min="100"
              max="44000"
              step="50"
              value={dpi.y}
              onChange={(event) => setDpi({ ...dpi, y: Number(event.target.value) })}
            />
          </label>
          <label>
            LOD
            <select value={dpi.lod} onChange={(event) => setDpi({ ...dpi, lod: event.target.value as ExtendedDpiSettings['lod'] })}>
              <option value="LOW">LOW</option>
              <option value="HIGH">HIGH</option>
            </select>
          </label>
          <button type="button" onClick={() => onWriteDpi(dpi)} disabled={busy || !snapshot?.dpi}>
            <Save aria-hidden="true" size={18} />
            Write DPI
          </button>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Polling</legend>
          <label>
            Report rate
            <select value={reportRate} onChange={(event) => setReportRate(event.target.value as ExtendedReportRate)}>
              {REPORT_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onWriteReportRate(reportRate)} disabled={busy || !snapshot?.reportRate}>
            <Save aria-hidden="true" size={18} />
            Write polling
          </button>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Onboard mode</legend>
          <label>
            Mode
            <select value={onboardMode} onChange={(event) => setOnboardMode(event.target.value as OnboardMode)}>
              <option value="host">Host</option>
              <option value="onboard">Onboard</option>
              <option value="no-change">No change</option>
            </select>
          </label>
          <button type="button" onClick={() => onWriteOnboardMode(onboardMode)} disabled={busy || !snapshot?.onboardMode}>
            <Save aria-hidden="true" size={18} />
            Write mode
          </button>
        </fieldset>
      </div>
    </section>
  );
}

function ButtonTuningEditor({
  button,
  value,
  onChange,
}: {
  button: SuperstrikeButton;
  value: SuperstrikeButtonSettings;
  onChange: (value: SuperstrikeButtonSettings) => void;
}) {
  const label = button === 'left' ? 'Left' : 'Right';

  return (
    <div className="button-tuning">
      <h3>{label}</h3>
      <NumberField
        label={`${label} actuation`}
        max={10}
        min={1}
        value={value.actuation}
        onChange={(actuation) => onChange({ ...value, actuation })}
      />
      <NumberField
        label={`${label} rapid trigger`}
        max={5}
        min={1}
        value={value.rapidTrigger}
        onChange={(rapidTrigger) => onChange({ ...value, rapidTrigger })}
      />
      <NumberField
        label={`${label} haptics`}
        max={5}
        min={0}
        value={value.haptics}
        onChange={(haptics) => onChange({ ...value, haptics })}
      />
    </div>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        max={max}
        min={min}
        step="1"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
