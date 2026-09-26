import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  createEmptySnapshot,
  memorySnapshotSchema,
  parseMemoryBackup,
  type MemoryBackup,
  type MemorySnapshot,
} from '../domain/memory-backup';
import { memoryMaster } from '../domain/memory-master';
import {
  getMemoryIssues,
  produceMemorySchema,
  type ProduceMemory,
  type ProduceMemoryId,
} from '../domain/produce-memory';

interface MemoryDatabase extends DBSchema {
  state: { key: string; value: unknown };
}
/** Storage is replaceable; every mutation is atomic and checks the caller's revision. */
export interface MemoryRepository {
  load(): Promise<MemorySnapshot>;
  save(memory: ProduceMemory, revision: number): Promise<MemorySnapshot>;
  remove(id: ProduceMemoryId, revision: number): Promise<MemorySnapshot>;
  replace(backup: MemoryBackup, revision: number): Promise<MemorySnapshot>;
  markBackup(at: string, revision: number): Promise<MemorySnapshot>;
  readRaw(): Promise<unknown>;
  close(): Promise<void>;
}

/** IndexedDB never falls back to volatile storage when a read or write fails. */
export function createMemoryRepository(
  databaseName = 'gakumas-produce-memory-deck',
): MemoryRepository {
  let connection: Promise<IDBPDatabase<MemoryDatabase>> | undefined;
  function connect() {
    if (!connection) {
      connection = new Promise<IDBPDatabase<MemoryDatabase>>((resolve, reject) => {
        let blocked = false;
        const pending = openDB<MemoryDatabase>(databaseName, 1, {
          upgrade(db) {
            db.createObjectStore('state');
          },
          blocked() {
            blocked = true;
            reject(new Error('Memory storage: 他のタブを閉じて再読み込みしてください'));
          },
          blocking() {
            void pending.then((db) => db.close());
            connection = undefined;
          },
          terminated() {
            connection = undefined;
          },
        });
        pending.then((db) => {
          if (blocked) db.close();
          else resolve(db);
        }, reject);
      });
      connection.catch(() => {
        connection = undefined;
      });
    }
    return connection;
  }
  function parseSnapshot(raw: unknown) {
    if (raw === undefined) return createEmptySnapshot();
    const result = memorySnapshotSchema.safeParse(raw);
    if (!result.success || result.data.masterVersion > memoryMaster.version)
      throw new Error(
        'Memory storage: 未対応または破損した保存データです。原本をダウンロードし、対応版で開いてください',
      );
    return result.data;
  }
  async function mutate(revision: number, update: (current: MemorySnapshot) => MemorySnapshot) {
    const db = await connect();
    const transaction = db.transaction('state', 'readwrite');
    try {
      const current = parseSnapshot(await transaction.store.get('snapshot'));
      if (current.revision !== revision)
        throw new Error(
          'Memory storage: 別のタブで更新されています。入力を控え、再読み込みしてからやり直してください',
        );
      const next = memorySnapshotSchema.parse({
        ...update(current),
        revision: current.revision + 1,
        masterVersion: memoryMaster.version,
      });
      await transaction.store.put(next, 'snapshot');
      await transaction.done;
      return next;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* An already failed transaction is already rolled back. */
      }
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }
  return {
    async load() {
      return parseSnapshot(await (await connect()).get('state', 'snapshot'));
    },
    async readRaw() {
      return (await connect()).get('state', 'snapshot');
    },
    async save(input, revision) {
      const memory = produceMemorySchema.parse(input);
      const issues = getMemoryIssues(memory);
      if (issues.length) throw new Error(`Memory validation: ${issues.join(' / ')}`);
      return mutate(revision, (current) => {
        const existing = current.memories.find((m) => m.id === memory.id);
        if (existing && memory.createdAt !== existing.createdAt)
          throw new Error('Memory storage: 登録日時は変更できません');
        const memories = existing
          ? current.memories.map((m) => (m.id === memory.id ? memory : m))
          : [...current.memories, memory];
        return { ...current, memories };
      });
    },
    remove(id, revision) {
      return mutate(revision, (current) => ({
        ...current,
        memories: current.memories.filter((m) => m.id !== id),
      }));
    },
    replace(backup, revision) {
      const validated = parseMemoryBackup(JSON.stringify(backup));
      return mutate(revision, (current) => ({
        ...current,
        memories: validated.memories,
        lastBackupAt: null,
      }));
    },
    markBackup(at, revision) {
      return mutate(revision, (current) => ({ ...current, lastBackupAt: at }));
    },
    async close() {
      if (connection) (await connection).close();
      connection = undefined;
    },
  };
}
