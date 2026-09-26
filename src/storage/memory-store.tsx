import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createMemoryRepository } from './memory-repository';
import type { MemoryBackup, MemorySnapshot } from '../domain/memory-backup';
import type { ProduceMemory, ProduceMemoryId } from '../domain/produce-memory';

const repository = createMemoryRepository();
type MemoryStoreState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; snapshot: MemorySnapshot };
interface MemoryStore {
  state: MemoryStoreState;
  busy: boolean;
  save: (memory: ProduceMemory) => Promise<void>;
  remove: (id: ProduceMemoryId) => Promise<void>;
  replace: (backup: MemoryBackup) => Promise<void>;
  markBackup: (at: string) => Promise<void>;
  readRaw: () => Promise<unknown>;
}
const MemoryStoreContext = createContext<MemoryStore | null>(null);

/** Storage failures are actionable and never reported as a successful save. */
export function describeStorageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '保存容量が不足しています。入力は保持しています。バックアップを取り、空き容量を確保して再試行してください。';
  return error instanceof Error ? error.message : '保存できませんでした。入力は保持しています。ブラウザの保存設定を確認してください。';
}

/** The provider swaps UI state only after IndexedDB commits successfully. */
export function MemoryStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MemoryStoreState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const snapshotRef = useRef<MemorySnapshot | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    repository.load().then(snapshot => {
      if (!cancelled) { snapshotRef.current = snapshot; setState({ status: 'ready', snapshot }); }
    }, error => { if (!cancelled) setState({ status: 'error', message: describeStorageError(error) }); });
    return () => { cancelled = true; };
  }, []);
  async function mutate(operation: (revision: number) => Promise<MemorySnapshot>) {
    if (!snapshotRef.current || busyRef.current) throw new Error('Memory storage: 読み込みまたは保存処理が完了するまでお待ちください');
    busyRef.current = true; setBusy(true);
    try {
      const snapshot = await operation(snapshotRef.current.revision);
      snapshotRef.current = snapshot;
      setState({ status: 'ready', snapshot });
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <MemoryStoreContext.Provider value={{ state, busy,
    save: memory => mutate(revision => repository.save(memory, revision)),
    remove: id => mutate(revision => repository.remove(id, revision)),
    replace: backup => mutate(revision => repository.replace(backup, revision)),
    markBackup: at => mutate(revision => repository.markBackup(at, revision)),
    readRaw: () => repository.readRaw(),
  }}>{children}</MemoryStoreContext.Provider>;
}

/** Access to owned memory data always goes through the replaceable repository. */
export function useMemoryStore(): MemoryStore {
  const store = useContext(MemoryStoreContext);
  if (!store) throw new Error('Memory store: Providerが必要です');
  return store;
}
