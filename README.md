# Superstrike WebHID Driver

Browser-based HID++ configuration utility for Logitech PRO X2 SUPERSTRIKE / Superstrike X2.

The app talks to the device through WebHID and does not depend on Solaar or Logitech G HUB at runtime. It includes validated controls for known features and an isolated Diagnostics view for protocol inspection.

## Supported Controls

- Superstrike click tuning through `SUPERSTRIKE_TUNING` (`0x1B0C`)
  - Left/right actuation point: `1..10`
  - Left/right rapid trigger level: `1..5`
  - Left/right click haptics: `0..5`
- Extended DPI through `EXTENDED_ADJUSTABLE_DPI` (`0x2202`)
  - X/Y DPI
  - Lift-off distance: `LOW` or `HIGH`
- Extended polling through `EXTENDED_ADJUSTABLE_REPORT_RATE` (`0x8061`)
  - `8ms`, `4ms`, `2ms`, `1ms`, `500us`, `250us`, `125us`
- Onboard mode through `ONBOARD_PROFILES` (`0x8100`)
  - Host
  - Onboard
  - No change

## Setup

```bash
nix develop
pnpm install
pnpm dev
```

Open the printed localhost URL in a Chromium-based browser with WebHID support.

## GitHub Pages HTTPS Deployment

The repository includes `.github/workflows/pages.yml` for GitHub Pages deployment through GitHub Actions.

1. Push this repository to GitHub.
2. In the GitHub repository, open Settings -> Pages.
3. Set Source to `GitHub Actions`.
4. Push to `main` or run the `Deploy GitHub Pages` workflow manually.
5. Open the published HTTPS URL from the workflow summary or Pages settings.

For a normal project repository, Vite automatically builds with `/<repo>/` as the base path in GitHub Actions. For a user or organization Pages repository ending in `.github.io`, it builds with `/`.

## Verification

```bash
pnpm test -- --run
pnpm typecheck
pnpm build
scripts/check-device
```

To verify the GitHub Pages base path locally:

```bash
GITHUB_REPOSITORY=keewai/logicool-web-driver pnpm build
```

`scripts/check-device` reports Logitech USB devices and current `/dev/hidraw*` permissions. It does not require a connected Superstrike device to complete.

## Browser and Linux Notes

- WebHID requires a secure context. `localhost` from `pnpm dev` is accepted.
- GitHub Pages serves the app over HTTPS, which is also accepted by WebHID-capable browsers.
- Firefox does not expose WebHID.
- On Linux, the browser must be allowed to open the HID interface. If connection fails, inspect `/dev/hidraw*` permissions and your udev rules.
- If another tool has exclusive access to the device, close it before connecting from the browser.

## Safety Model

- Read the device before writing settings.
- Export a JSON backup after reading and before writing.
- Normal settings writes use range-checked controls only.
- Raw HID requests are confined to Diagnostics and are not used by the normal settings form.
- If a feature is missing or returns an unexpected value, the UI marks it unsupported instead of writing through it.

## Diagnostics

Diagnostics shows feature indexes from the latest snapshot, raw request fields, and the HID protocol log. Use it to verify real Superstrike firmware behavior when a feature function number or payload shape differs from the current codec.
