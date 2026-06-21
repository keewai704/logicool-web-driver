import { Download } from 'lucide-react';
import { createBackup, downloadBackupJson } from '../domain/backup';
import type { DeviceSnapshot } from '../hid/superstrikeDriver';

interface BackupPanelProps {
  snapshot: DeviceSnapshot | null;
}

export default function BackupPanel({ snapshot }: BackupPanelProps) {
  return (
    <section className="panel" aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup</h2>
      <p className="muted">Export the last read snapshot before writing settings.</p>
      <button
        type="button"
        disabled={!snapshot}
        onClick={() => {
          if (snapshot) {
            downloadBackupJson(createBackup(snapshot));
          }
        }}
      >
        <Download aria-hidden="true" size={18} />
        Export JSON
      </button>
    </section>
  );
}
