import type { DeviceSnapshot } from '../hid/superstrikeDriver';

export interface BackupDocument {
  schemaVersion: 1;
  kind: 'superstrike-webhid-backup';
  exportedAt: string;
  snapshot: DeviceSnapshot;
}

export function createBackup(snapshot: DeviceSnapshot, now = new Date()): BackupDocument {
  return {
    schemaVersion: 1,
    kind: 'superstrike-webhid-backup',
    exportedAt: now.toISOString(),
    snapshot,
  };
}

export function downloadBackupJson(backup: BackupDocument): void {
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = backup.snapshot.device.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = url;
  link.download = `${safeName || 'superstrike'}-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
