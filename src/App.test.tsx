import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { DeviceSnapshot } from './hid/superstrikeDriver';
import { SuperstrikeDriver } from './hid/superstrikeDriver';
import { requestLogitechDevice } from './hid/webhidTransport';

vi.mock('./hid/superstrikeDriver', () => ({
  SuperstrikeDriver: vi.fn(),
}));

vi.mock('./hid/webhidTransport', () => ({
  requestLogitechDevice: vi.fn(),
  WebHidTransport: vi.fn(),
}));

const snapshot: DeviceSnapshot = {
  schemaVersion: 1,
  capturedAt: '2026-06-21T00:00:00.000Z',
  device: {
    productName: 'Fake PRO X2 SUPERSTRIKE',
    vendorId: 0x046d,
    productId: 0x40bd,
  },
  features: {},
  unsupportedFeatures: [],
  superstrike: {
    left: { actuation: 5, rapidTrigger: 3, haptics: 3 },
    right: { actuation: 5, rapidTrigger: 3, haptics: 3 },
  },
  dpi: { x: 800, y: 800, lod: 'HIGH' },
  reportRate: '1ms',
  onboardMode: 'onboard',
  logs: [],
};

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: {},
    });
  });

  it('renders the driver title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /superstrike web driver/i })).toBeInTheDocument();
  });

  it('reads a snapshot automatically after connecting', async () => {
    const user = userEvent.setup();
    const readSnapshot = vi.fn().mockResolvedValue(snapshot);
    vi.mocked(requestLogitechDevice).mockResolvedValue({
      productName: 'Fake PRO X2 SUPERSTRIKE',
      vendorId: 0x046d,
      productId: 0x40bd,
    } as HIDDevice);
    vi.mocked(SuperstrikeDriver).mockImplementation(() => ({ readSnapshot }) as unknown as SuperstrikeDriver);

    render(<App />);
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(readSnapshot).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Device connected and snapshot read.')).toBeInTheDocument();
    expect(screen.getByText('Fake PRO X2 SUPERSTRIKE')).toBeInTheDocument();
  });
});
