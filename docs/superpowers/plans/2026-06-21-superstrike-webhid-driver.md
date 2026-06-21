# Superstrike WebHID Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Nix-ready WebHID driver app that directly edits Logitech PRO X2 SUPERSTRIKE onboard and device-resident settings from the browser.

**Architecture:** A Vite + React + TypeScript frontend owns the UI and talks to a small HID++ transport layer through the browser WebHID API. Core protocol code is framework-independent and unit-tested with mock HID devices, while the React layer focuses on connection state, validated forms, backup/restore, and diagnostics.

**Tech Stack:** Nix flakes, Node.js, pnpm, Vite, React, TypeScript, Vitest, Testing Library, WebHID.

## Global Constraints

- The app must use WebHID directly; Solaar can inform protocol decisions but is not used as a runtime dependency.
- The first supported target is Logitech PRO X2 SUPERSTRIKE / Superstrike X2 using Logitech VID `0x046d`.
- Supported HID++ features are `SUPERSTRIKE_TUNING` `0x1B0C`, `EXTENDED_ADJUSTABLE_DPI` `0x2202`, `EXTENDED_ADJUSTABLE_REPORT_RATE` `0x8061`, and `ONBOARD_PROFILES` `0x8100`.
- Actuation point must validate to integer range `1..10`.
- Rapid trigger level must validate to integer range `1..5`.
- Click haptics must validate to integer range `0..5`.
- The UI must read current values before writing and expose a JSON backup export before destructive writes.
- Raw HID writes must be isolated under Diagnostics and never share the normal settings submit path.
- Nix must provide all development tooling needed to install dependencies, run tests, run lint/typecheck, inspect USB devices, and start the app.
- Since the initial directory is not a Git repository, commit steps are documented but skipped unless the implementer initializes Git.

---

## File Structure

- `flake.nix`: Nix dev shell for Node/pnpm plus Linux USB/HID inspection tools.
- `.envrc`: direnv convenience file using the flake shell.
- `.gitignore`: local build, dependency, and generated artifacts.
- `package.json`: project scripts and dependencies.
- `pnpm-lock.yaml`: generated dependency lock file.
- `index.html`: Vite HTML entry.
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`: TypeScript, Vite, and Vitest configuration.
- `src/main.tsx`: React entry point.
- `src/App.tsx`: top-level application shell and tab state.
- `src/styles.css`: application styling.
- `src/types/webhid.d.ts`: WebHID type declarations for browsers that lack built-in TypeScript DOM typings.
- `src/domain/validation.ts`: setting range validation.
- `src/domain/backup.ts`: backup document shape and serialization.
- `src/hid/hidpp.ts`: HID++ packet construction and parsing.
- `src/hid/features.ts`: feature IDs and feature-specific codecs.
- `src/hid/webhidTransport.ts`: WebHID adapter and device request filtering.
- `src/hid/superstrikeDriver.ts`: high-level driver that combines transport, feature lookup, reads, writes, and diagnostics.
- `src/components/ConnectionPanel.tsx`: device connection and status UI.
- `src/components/SuperstrikeSettings.tsx`: normal settings form for Superstrike tuning, DPI/LOD, polling, and onboard mode.
- `src/components/BackupPanel.tsx`: backup export and import/restore UI.
- `src/components/DiagnosticsPanel.tsx`: raw request UI and protocol log.
- `src/test/testUtils.ts`: test helpers and fake WebHID devices.
- `src/**/*.test.ts`, `src/**/*.test.tsx`: unit and component tests.
- `scripts/check-device`: Linux helper for Logitech device and hidraw permission checks.
- `README.md`: setup, browser requirements, Nix usage, safety notes, and verification commands.

## Task 1: Project and Nix Scaffold

**Files:**
- Create: `flake.nix`
- Create: `.envrc`
- Create: `.gitignore`
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/types/webhid.d.ts`
- Create: `scripts/check-device`

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `scripts/check-device`.

- [ ] **Step 1: Write the failing scaffold smoke test**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the driver title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /superstrike web driver/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run src/App.test.tsx`

Expected: FAIL because `package.json`, Vitest, and the React app do not exist yet.

- [ ] **Step 3: Create the minimal project scaffold**

Create the files listed for this task with:

```tsx
// src/App.tsx
export default function App() {
  return (
    <main className="app-shell">
      <h1>Superstrike Web Driver</h1>
      <p>Connect your Logitech PRO X2 SUPERSTRIKE to inspect and edit device settings.</p>
    </main>
  );
}
```

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

```ts
// src/types/webhid.d.ts
interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HIDInputReportEvent extends Event {
  readonly data: DataView;
  readonly device: HIDDevice;
  readonly reportId: number;
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly productId: number;
  readonly productName: string;
  readonly vendorId: number;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport?(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport?(reportId: number): Promise<DataView>;
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}

interface Navigator {
  hid?: HID;
}
```

```css
/* src/styles.css */
:root {
  color-scheme: light dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5f7fb;
  color: #17202a;
}

body {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
}
```

- [ ] **Step 4: Install dependencies and run scaffold tests**

Run: `pnpm install`

Run: `pnpm test -- --run src/App.test.tsx`

Expected: PASS with the heading rendered.

- [ ] **Step 5: Commit if Git exists**

Run: `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git add . && git commit -m "chore: scaffold webhid driver" || true`

Expected: Commit is created in a Git repository, otherwise skipped.

## Task 2: HID++ Packet Layer

**Files:**
- Create: `src/hid/hidpp.ts`
- Test: `src/hid/hidpp.test.ts`

**Interfaces:**
- Produces: `buildFeatureRequest(options: HidppFeatureRequest): Uint8Array`
- Produces: `parseFeatureResponse(reportId: number, data: DataView | Uint8Array): HidppResponse`
- Produces: `toHex(bytes: ArrayLike<number>): string`

- [ ] **Step 1: Write failing packet tests**

Create `src/hid/hidpp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildFeatureRequest, parseFeatureResponse, toHex } from './hidpp';

describe('hidpp packet helpers', () => {
  it('builds a short HID++ feature request', () => {
    const packet = buildFeatureRequest({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
      params: [0x00, 0x01],
    });

    expect(Array.from(packet)).toEqual([0xff, 0x08, 0x10, 0x00, 0x01, 0x00]);
  });

  it('builds a long HID++ feature request padded to 19 bytes', () => {
    const packet = buildFeatureRequest({
      reportId: 0x11,
      deviceIndex: 0x01,
      featureIndex: 0x0a,
      functionId: 0x50,
      params: Array.from({ length: 14 }, (_, index) => index),
    });

    expect(packet).toHaveLength(19);
    expect(Array.from(packet.slice(0, 5))).toEqual([0x01, 0x0a, 0x50, 0x00, 0x01]);
    expect(packet[18]).toBe(13);
  });

  it('parses response bytes into header and params', () => {
    const response = parseFeatureResponse(0x10, new Uint8Array([0xff, 0x08, 0x10, 0x01, 0x02, 0x03]));

    expect(response).toEqual({
      reportId: 0x10,
      deviceIndex: 0xff,
      featureIndex: 0x08,
      functionId: 0x10,
      params: new Uint8Array([0x01, 0x02, 0x03]),
    });
  });

  it('formats bytes as uppercase hex', () => {
    expect(toHex([0, 10, 255])).toBe('00 0A FF');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run src/hid/hidpp.test.ts`

Expected: FAIL because `src/hid/hidpp.ts` does not exist.

- [ ] **Step 3: Implement packet helpers**

Create `src/hid/hidpp.ts`:

```ts
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
```

- [ ] **Step 4: Run packet tests**

Run: `pnpm test -- --run src/hid/hidpp.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if Git exists**

Run: `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git add src/hid/hidpp.ts src/hid/hidpp.test.ts && git commit -m "feat: add hidpp packet helpers" || true`

Expected: Commit is created in a Git repository, otherwise skipped.

## Task 3: Feature Codecs and Validation

**Files:**
- Create: `src/domain/validation.ts`
- Create: `src/hid/features.ts`
- Test: `src/domain/validation.test.ts`
- Test: `src/hid/features.test.ts`

**Interfaces:**
- Produces: `validateSuperstrikeSettings(input: SuperstrikeSettings): ValidationResult`
- Produces: `encodeSuperstrikeWrite(button: SuperstrikeButton, setting: SuperstrikeSettingKey, value: number): number[]`
- Produces: `decodeSuperstrikeRead(params: Uint8Array): SuperstrikeButtonSettings`
- Produces: `encodeExtendedDpi(settings: ExtendedDpiSettings): number[]`
- Produces: `encodeExtendedReportRate(value: ExtendedReportRate): number[]`
- Produces: constants `FEATURE_IDS`.

- [ ] **Step 1: Write failing validation and codec tests**

Create tests that assert:

```ts
expect(validateSuperstrikeSettings(validSettings).ok).toBe(true);
expect(validateSuperstrikeSettings({ ...validSettings, left: { ...validSettings.left, actuation: 0 } }).ok).toBe(false);
expect(encodeSuperstrikeWrite('left', 'actuation', 7)).toEqual([0x00, 0x00, 0x07]);
expect(encodeSuperstrikeWrite('right', 'haptics', 0)).toEqual([0x01, 0x02, 0x00]);
expect(encodeExtendedDpi({ x: 1600, y: 1600, lod: 'HIGH' })).toEqual([0x06, 0x40, 0x06, 0x40, 0x01]);
expect(encodeExtendedReportRate('125us')).toEqual([0x06]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run src/domain/validation.test.ts src/hid/features.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement validation and codecs**

Implement integer range checks and feature codecs with:

```ts
export const FEATURE_IDS = {
  ROOT: 0x0000,
  FEATURE_SET: 0x0001,
  SUPERSTRIKE_TUNING: 0x1b0c,
  EXTENDED_ADJUSTABLE_DPI: 0x2202,
  EXTENDED_ADJUSTABLE_REPORT_RATE: 0x8061,
  ONBOARD_PROFILES: 0x8100,
} as const;
```

Use Superstrike setting selectors:

```ts
const SUPERSTRIKE_SETTING_INDEX = {
  actuation: 0x00,
  rapidTrigger: 0x01,
  haptics: 0x02,
} as const;
```

Use extended report rate mapping:

```ts
const EXTENDED_REPORT_RATE_VALUE = {
  '8ms': 0x00,
  '4ms': 0x01,
  '2ms': 0x02,
  '1ms': 0x03,
  '500us': 0x04,
  '250us': 0x05,
  '125us': 0x06,
} as const;
```

- [ ] **Step 4: Run validation and codec tests**

Run: `pnpm test -- --run src/domain/validation.test.ts src/hid/features.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if Git exists**

Run: `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git add src/domain src/hid/features.ts src/hid/features.test.ts && git commit -m "feat: add superstrike feature codecs" || true`

Expected: Commit is created in a Git repository, otherwise skipped.

## Task 4: WebHID Transport and High-Level Driver

**Files:**
- Create: `src/hid/webhidTransport.ts`
- Create: `src/hid/superstrikeDriver.ts`
- Create: `src/test/testUtils.ts`
- Test: `src/hid/webhidTransport.test.ts`
- Test: `src/hid/superstrikeDriver.test.ts`

**Interfaces:**
- Produces: `requestLogitechDevice(hid: HID): Promise<HIDDevice | null>`
- Produces: `WebHidTransport.request(request: HidppFeatureRequest): Promise<HidppResponse>`
- Produces: `SuperstrikeDriver.readSnapshot(): Promise<DeviceSnapshot>`
- Produces: `SuperstrikeDriver.writeSuperstrikeSettings(settings: SuperstrikeSettings): Promise<void>`

- [ ] **Step 1: Write failing transport and driver tests**

Test that device request filters use vendor ID `0x046d`, that request/response correlation resolves matching reports, that timeouts reject, and that `writeSuperstrikeSettings` refuses invalid settings.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run src/hid/webhidTransport.test.ts src/hid/superstrikeDriver.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement transport and driver**

Implement request filtering:

```ts
export async function requestLogitechDevice(hid: HID): Promise<HIDDevice | null> {
  const [device] = await hid.requestDevice({ filters: [{ vendorId: 0x046d }] });
  return device ?? null;
}
```

Implement transport with `sendReport(reportId, payload)` and `inputreport` listener matching `deviceIndex`, `featureIndex`, and `functionId`.

Implement driver methods that use feature indexes from a feature map. If a feature is missing, return a status message in `DeviceSnapshot.unsupportedFeatures` and skip writes for that feature.

- [ ] **Step 4: Run transport and driver tests**

Run: `pnpm test -- --run src/hid/webhidTransport.test.ts src/hid/superstrikeDriver.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if Git exists**

Run: `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git add src/hid src/test && git commit -m "feat: add webhid superstrike driver" || true`

Expected: Commit is created in a Git repository, otherwise skipped.

## Task 5: Backup and UI Panels

**Files:**
- Create: `src/domain/backup.ts`
- Create: `src/components/ConnectionPanel.tsx`
- Create: `src/components/SuperstrikeSettings.tsx`
- Create: `src/components/BackupPanel.tsx`
- Create: `src/components/DiagnosticsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/domain/backup.test.ts`
- Test: `src/components/SuperstrikeSettings.test.tsx`

**Interfaces:**
- Produces: `createBackup(snapshot: DeviceSnapshot): BackupDocument`
- Produces: `downloadBackupJson(backup: BackupDocument): void`
- Produces: user workflow for connect, read, edit, backup, write, and diagnostics.

- [ ] **Step 1: Write failing backup and UI tests**

Test that backup JSON includes schema version, timestamp, device info, feature support, and settings snapshot. Test that invalid actuation disables the normal write button and displays the validation message.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run src/domain/backup.test.ts src/components/SuperstrikeSettings.test.tsx`

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement backup and UI panels**

Build a compact operational UI with:

- Connect button using WebHID.
- Read current device button.
- Settings form for left/right actuation, rapid trigger, haptics.
- DPI X/Y and LOD controls.
- Extended report rate selector.
- Onboard profile mode selector.
- Backup export button available after a snapshot is read.
- Diagnostics tab with feature indexes, request log, and isolated raw request form.

- [ ] **Step 4: Run backup and UI tests**

Run: `pnpm test -- --run src/domain/backup.test.ts src/components/SuperstrikeSettings.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit if Git exists**

Run: `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git add src && git commit -m "feat: add superstrike settings ui" || true`

Expected: Commit is created in a Git repository, otherwise skipped.

## Task 6: Documentation and Final Verification

**Files:**
- Create: `README.md`
- Modify: `scripts/check-device`
- Modify: `package.json`

**Interfaces:**
- Produces: complete local developer workflow.

- [ ] **Step 1: Write README and device-check expectations**

Document:

- `nix develop`
- `pnpm install`
- `pnpm dev`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Chromium/Chrome WebHID requirement
- Linux hidraw/udev troubleshooting
- Backup-before-write safety notes
- Unsupported feature diagnostics

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test -- --run
pnpm typecheck
pnpm build
scripts/check-device
```

Expected: unit tests pass, typecheck passes, build passes, and `scripts/check-device` prints either detected Logitech HID devices or actionable permission/browser guidance.

- [ ] **Step 3: Commit if Git exists**

Run: `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git add . && git commit -m "docs: add setup and verification guide" || true`

Expected: Commit is created in a Git repository, otherwise skipped.

## Self-Review

- Spec coverage: Tasks cover Nix environment, WebHID transport, supported HID++ features, Superstrike tuning, DPI, report rate, onboard profiles, backup, diagnostics, and tests.
- Placeholder scan: No `TBD`, unbounded TODO, or unspecified file paths remain.
- Type consistency: `SuperstrikeSettings`, `DeviceSnapshot`, `HidppFeatureRequest`, and `HidppResponse` are introduced before later tasks consume them.
- Known risk: Actual Superstrike HID++ function numbers for `0x1B0C`, `0x2202`, and `0x8061` may require adjustment after live Diagnostics output. The app must therefore keep feature codecs isolated and expose raw diagnostics without routing raw writes through the normal settings form.
