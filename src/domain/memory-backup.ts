import { z } from 'zod';
import { memoryMaster, type MemoryMaster } from './memory-master';
import { getMemoryIssues, produceMemorySchema, type ProduceMemory } from './produce-memory';

/** Unknown future versions fail closed; the original IndexedDB value is left untouched. */
export const memorySnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    masterVersion: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    memories: z.array(produceMemorySchema),
    lastBackupAt: z.iso.datetime().nullable(),
  })
  .superRefine((snapshot, context) => {
    if (new Set(snapshot.memories.map((m) => m.id)).size !== snapshot.memories.length)
      context.addIssue({ code: 'custom', message: 'メモリーIDが重複しています' });
  });
/** A revision protects against stale writes from another browser tab. */
export type MemorySnapshot = z.infer<typeof memorySnapshotSchema>;
const memoryBackupSchema = z.strictObject({
  app: z.literal('gakumas-produce-memory-deck'),
  schemaVersion: z.literal(1),
  masterVersion: z.number().int().positive(),
  exportedAt: z.iso.datetime(),
  memories: z.array(produceMemorySchema),
});
/** An import preview is validated fully before any destructive transaction starts. */
export type MemoryBackup = z.infer<typeof memoryBackupSchema>;

/** Empty state is only used when the database key does not exist, never on errors. */
export function createEmptySnapshot(): MemorySnapshot {
  return {
    schemaVersion: 1,
    masterVersion: memoryMaster.version,
    revision: 0,
    memories: [],
    lastBackupAt: null,
  };
}

/** Export keeps unknown references so master updates cannot silently delete owned data. */
export function createMemoryBackup(
  memories: ProduceMemory[],
  masterVersion = memoryMaster.version,
): MemoryBackup {
  return {
    app: 'gakumas-produce-memory-deck',
    schemaVersion: 1,
    masterVersion,
    exportedAt: new Date().toISOString(),
    memories,
  };
}

/** Invalid references, duplicates and future versions reject the entire import. */
export function parseMemoryBackup(text: string, master: MemoryMaster = memoryMaster): MemoryBackup {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('Backup validation: JSONファイルを読み取れません');
  }
  const result = memoryBackupSchema.safeParse(input);
  if (!result.success)
    throw new Error('Backup validation: バックアップの形式またはデータバージョンが不正です');
  const backup = result.data;
  if (backup.masterVersion > master.version)
    throw new Error(
      'Backup validation: 新しいマスターのバックアップです。アプリを更新してください',
    );
  if (new Set(backup.memories.map((m) => m.id)).size !== backup.memories.length)
    throw new Error('Backup validation: メモリーIDが重複しています');
  for (const memory of backup.memories) {
    const issues = getMemoryIssues(memory, master);
    if (issues.length) throw new Error(`Backup validation: ${memory.id}: ${issues.join(' / ')}`);
  }
  return backup;
}
