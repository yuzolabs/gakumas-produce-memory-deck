import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { createMemoryBackup, parseMemoryBackup, type MemoryBackup } from '../domain/memory-backup';
import { memoryMaster } from '../domain/memory-master';
import { describeStorageError, useMemoryStore } from '../storage/memory-store';
import { downloadMemoryJson } from '../lib/download-memory-json';
import { MemoryConfirmDialog } from '../components/memory-confirm-dialog';
import { Button } from '../components/ui/button';

/** Import is a validated, explicitly confirmed, all-or-nothing replacement. */
export function MemorySettingsPage() {
  const store = useMemoryStore();
  const [pending, setPending] = useState<{ backup: MemoryBackup; filename: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileSequence = useRef(0);
  if (store.state.status !== 'ready') return null;
  const snapshot = store.state.snapshot;
  async function exportBackup() {
    setError(''); setNotice('');
    try {
      const backup = createMemoryBackup(snapshot.memories, snapshot.masterVersion);
      downloadMemoryJson(backup, `produce-memories-${backup.exportedAt.slice(0, 10)}.json`);
      await store.markBackup(backup.exportedAt);
      setNotice('JSONを出力しました。ダウンロードフォルダーにファイルがあることを確認してください。');
    } catch (caught) { setError(`バックアップ日時を記録できない場合も、ファイルが出力されていることがあります。${describeStorageError(caught)}`); }
  }
  async function readBackup(file: File | undefined) {
    const sequence = ++fileSequence.current;
    setPending(null); setError(''); setNotice('');
    if (!file) { setReading(false); return; }
    setReading(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Backup file: 10MB以下のJSONファイルを選択してください');
      const backup = parseMemoryBackup(await file.text());
      if (sequence === fileSequence.current) setPending({ backup, filename: file.name });
    } catch (caught) { if (sequence === fileSequence.current) setError(describeStorageError(caught)); }
    finally { if (sequence === fileSequence.current) setReading(false); }
  }
  async function importBackup() {
    if (!pending) return;
    try {
      await store.replace(pending.backup);
      setNotice(`${pending.backup.memories.length}枚のメモリーを復元しました。`);
      setPending(null); setConfirming(false); setError('');
    } catch (caught) { setError(describeStorageError(caught)); }
  }
  return <>
    <div className="page-heading"><div><h1>バックアップ</h1><p>大切なメモリーを、ブラウザの外にも残しておきましょう。</p></div></div>
    <div className="backup-warning"><h2>保存先はこのブラウザです</h2><p>サイトデータの削除、ブラウザの変更、端末の故障で登録内容は失われます。クラウド同期はありません。ローカルと公開サイトのデータも別管理です。</p></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && !confirming && <p className="error-message" role="alert">{error}</p>}
    <div className="backup-layout">
      <section className="backup-panel"><Download aria-hidden="true" /><h2>JSONをエクスポート</h2><p>登録済みの{snapshot.memories.length}枚を、1つのファイルにまとめます。</p>
        <dl className="backup-metadata"><dt>最終バックアップ（出力操作）</dt><dd>{snapshot.lastBackupAt ? new Date(snapshot.lastBackupAt).toLocaleString('ja-JP') : 'まだ出力していません'}</dd></dl>
        <Button onClick={() => void exportBackup()} disabled={store.busy}>JSONをダウンロード</Button><small>日時は出力操作の記録です。ファイルの保存完了はブラウザで確認してください。</small>
      </section>
      <section className="backup-panel"><Upload aria-hidden="true" /><h2>JSONから復元</h2><p>形式・ID・組み合わせを検証してから、登録内容を全件置換します。追加や自動マージはしません。</p>
        <div className="field"><label htmlFor="backup-file">バックアップファイル（JSON・10MB以下）</label><input id="backup-file" type="file" accept=".json,application/json" disabled={store.busy} onChange={event => { void readBackup(event.target.files?.[0]); event.target.value = ''; }} /></div>
        {reading && <p role="status">ファイルを検証しています…</p>}
        {pending && <div className="import-preview" role="status"><strong>{pending.filename}</strong><p>{pending.backup.memories.length}枚 / 出力日 {new Date(pending.backup.exportedAt).toLocaleString('ja-JP')}</p><p>形式と参照先の検証が完了しました。まだ保存データは変更していません。</p><Button disabled={store.busy || reading} onClick={() => { setError(''); setConfirming(true); }}>全件置換の確認へ</Button></div>}
      </section>
    </div>
    <section className="master-notice"><h2>収録範囲とデータの出典</h2><p>マスターバージョン {memoryMaster.version}。通常のプロデュースカード（R・SR・SSR）{memoryMaster.cards.length}種を、強化前後を分けて収録しています。固有・サポート・基本・レジェンドカードは対象外です。</p><p>カスタムは効果の最終値ではなく段階数で記録します。HIFはプランごとの発動対象と固定効果を収録。画像・その他の通常アビリティ・自動評価は対象外です。</p>
      <p>HIF対応：<a href="https://wikiwiki.jp/gakumas/HIF/メモリーアビリティ">学園アイドルマスターコンテストWiki</a>。ボーナス値：<a href="https://game8.jp/gakuen-idolmaster/613860">Game8のメモリー解説</a>。</p>
    </section>
    <MemoryConfirmDialog open={confirming} onOpenChange={setConfirming} title="登録内容をすべて置き換えますか？" description={`現在の${snapshot.memories.length}枚を削除し、ファイル内の${pending?.backup.memories.length ?? 0}枚に置き換えます。取り消せません。先に現在のデータをエクスポートしてください。`} action="全件を置き換える" busy={store.busy} error={error} onConfirm={() => void importBackup()} />
  </>;
}
