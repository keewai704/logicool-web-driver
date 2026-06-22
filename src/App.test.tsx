import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const desiredSuperstrike = {
  left: { actuation: 7, rapidTrigger: 4, haptics: 2 },
  right: { actuation: 6, rapidTrigger: 3, haptics: 1 },
};

const desiredSnapshot: DeviceSnapshot = {
  ...snapshot,
  superstrike: desiredSuperstrike,
};

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the driver title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /superstrike web driver/i })).toBeInTheDocument();
  });

  it('does not render a manual read button', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /^read$/i })).not.toBeInTheDocument();
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

  it('reapplies saved Superstrike tuning after connecting when the device differs', async () => {
    localStorage.setItem('superstrike-webhid:desired-superstrike', JSON.stringify(desiredSuperstrike));
    const user = userEvent.setup();
    const readSnapshot = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce(desiredSnapshot);
    const writeSuperstrikeSettings = vi.fn().mockResolvedValue(undefined);
    vi.mocked(requestLogitechDevice).mockResolvedValue({
      productName: 'Fake PRO X2 SUPERSTRIKE',
      vendorId: 0x046d,
      productId: 0x40bd,
    } as HIDDevice);
    vi.mocked(SuperstrikeDriver).mockImplementation(
      () => ({ readSnapshot, writeSuperstrikeSettings }) as unknown as SuperstrikeDriver,
    );

    render(<App />);
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(writeSuperstrikeSettings).toHaveBeenCalledWith(desiredSuperstrike));
    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Device connected, saved tuning reapplied, and snapshot read.')).toBeInTheDocument();
  });

  it('keeps saved Superstrike tuning applied while connected', async () => {
    vi.useFakeTimers();
    localStorage.setItem('superstrike-webhid:desired-superstrike', JSON.stringify(desiredSuperstrike));
    const readSnapshot = vi
      .fn()
      .mockResolvedValueOnce(desiredSnapshot)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(desiredSnapshot);
    const writeSuperstrikeSettings = vi.fn().mockResolvedValue(undefined);
    vi.mocked(requestLogitechDevice).mockResolvedValue({
      productName: 'Fake PRO X2 SUPERSTRIKE',
      vendorId: 0x046d,
      productId: 0x40bd,
    } as HIDDevice);
    vi.mocked(SuperstrikeDriver).mockImplementation(
      () => ({ readSnapshot, writeSuperstrikeSettings }) as unknown as SuperstrikeDriver,
    );

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    });
    expect(readSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(writeSuperstrikeSettings).toHaveBeenCalledWith(desiredSuperstrike);
    expect(screen.getByText('Saved Superstrike tuning reapplied.')).toBeInTheDocument();
  });
});
