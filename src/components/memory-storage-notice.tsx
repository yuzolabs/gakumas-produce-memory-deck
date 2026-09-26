import { Link } from 'react-router-dom';

/** Explain browser-only storage without implying that a download guarantees a backup. */
export function MemoryStorageNotice({
  backupReminder = false,
  showBackupLink = true,
}: {
  backupReminder?: boolean;
  showBackupLink?: boolean;
}) {
  return (
    <aside className="storage-notice" aria-label="保存先について">
      <p>
        <strong>保存先はこのブラウザです。</strong>
        端末・ブラウザ間の自動同期はありません。
      </p>
      <p>サイトデータを削除するとメモリーも消えます。定期的にJSONを出力し、保管してください。</p>
      {backupReminder && <p className="backup-reminder">バックアップをまだ出力していません。</p>}
      {showBackupLink && <Link to="/settings">バックアップを開く</Link>}
    </aside>
  );
}
