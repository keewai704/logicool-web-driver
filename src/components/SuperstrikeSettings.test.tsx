import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SuperstrikeSettings from './SuperstrikeSettings';
import type { DeviceSnapshot } from '../hid/superstrikeDriver';

const snapshot: DeviceSnapshot = {
  schemaVersion: 1,
  capturedAt: '2026-06-21T00:00:00.000Z',
  device: {
    productName: 'Fake PRO X2 SUPERSTRIKE',
    vendorId: 0x046d,
    productId: 0xc54d,
  },
  features: {
    SUPERSTRIKE_TUNING: {
      id: 0x1b0c,
      name: 'SUPERSTRIKE_TUNING',
      index: 0x08,
      flags: 0,
      version: 1,
      supported: true,
    },
  },
  unsupportedFeatures: [],
  superstrike: {
    left: { actuation: 5, rapidTrigger: 3, haptics: 4 },
    right: { actuation: 6, rapidTrigger: 2, haptics: 0 },
  },
  dpi: { x: 1600, y: 1600, lod: 'HIGH' },
  reportRate: '1ms',
  onboardMode: 'host',
  logs: [],
};

describe('SuperstrikeSettings', () => {
  it('disables normal tuning writes when actuation is invalid', async () => {
    const user = userEvent.setup();
    render(
      <SuperstrikeSettings
        busy={false}
        snapshot={snapshot}
        onWriteDpi={vi.fn()}
        onWriteOnboardMode={vi.fn()}
        onWriteReportRate={vi.fn()}
        onWriteSuperstrike={vi.fn()}
      />,
    );

    const leftActuation = screen.getByLabelText(/left actuation/i);
    await user.clear(leftActuation);
    await user.type(leftActuation, '0');

    expect(screen.getByRole('button', { name: /write tuning/i })).toBeDisabled();
    expect(screen.getByText('Left actuation must be an integer from 1 to 10.')).toBeInTheDocument();
  });

  it('requires a read snapshot before writing', () => {
    render(
      <SuperstrikeSettings
        busy={false}
        snapshot={null}
        onWriteDpi={vi.fn()}
        onWriteOnboardMode={vi.fn()}
        onWriteReportRate={vi.fn()}
        onWriteSuperstrike={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /write tuning/i })).toBeDisabled();
    expect(screen.getByText(/read the device before writing/i)).toBeInTheDocument();
  });
});
