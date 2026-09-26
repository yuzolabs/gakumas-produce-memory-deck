import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDraft } from '../domain/produce-memory';
import { createMemoryBackup, parseMemoryBackup } from '../domain/memory-backup';
import { createMemoryRepository, type MemoryRepository } from './memory-repository';

const repositories: MemoryRepository[] = [];
function setup(name = crypto.randomUUID()) {
  const repository = createMemoryRepository(name);
  repositories.push(repository);
  return repository;
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repositories.splice(0).map(r => r.close())); });

describe('IndexedDB memory repository', () => {
  it('persists create, update, duplicate, delete and reload', async () => {
    const name = crypto.randomUUID();
    const repository = setup(name);
    const memory = createMemoryDraft('card-295');
    let state = await repository.save(memory, 0);
    expect(state.memories).toHaveLength(1);
    memory.acquisitionTimingId = 'after-first-exam';
    state = await repository.save(memory, state.revision);
    const copy = { ...memory, id: createMemoryDraft().id };
    state = await repository.save(copy, state.revision);
    expect(state.memories).toHaveLength(2);
    state = await repository.remove(copy.id, state.revision);
    await repository.close();
    expect((await setup(name).load()).memories).toEqual([memory]);
  });
  it('rejects stale revisions across tabs rather than losing updates', async () => {
    const name = crypto.randomUUID();
    const first = setup(name), second = setup(name);
    await first.save(createMemoryDraft('card-295'), 0);
    await expect(second.save(createMemoryDraft('card-295'), 0)).rejects.toThrow('別のタブ');
    expect((await first.load()).memories).toHaveLength(1);
  });
  it('atomically restores backups, including empty backups, and records export time', async () => {
    const repository = setup();
    let state = await repository.save(createMemoryDraft('card-295'), 0);
    const backup = parseMemoryBackup(JSON.stringify(createMemoryBackup(state.memories)));
    state = await repository.markBackup(backup.exportedAt, state.revision);
    expect(state.lastBackupAt).toBe(backup.exportedAt);
    state = await repository.replace(createMemoryBackup([]), state.revision);
    expect(state.memories).toEqual([]);
    state = await repository.replace(backup, state.revision);
    expect(state.memories).toEqual(backup.memories);
    expect(state.lastBackupAt).toBeNull();
  });
  it('preserves the previous snapshot on transaction write failure', async () => {
    const repository = setup();
    const state = await repository.save(createMemoryDraft('card-295'), 0);
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('容量不足', 'QuotaExceededError'); });
    await expect(repository.replace(createMemoryBackup([]), state.revision)).rejects.toThrow('容量不足');
    spy.mockRestore();
    expect((await repository.load()).memories).toEqual(state.memories);
  });
  it('keeps unknown references and refuses unsupported schemas without overwriting raw data', async () => {
    const name = crypto.randomUUID();
    const repository = setup(name);
    await repository.load();
    const db = await openDB(name, 1);
    const unknownMemory = createMemoryDraft('removed-card');
    const snapshot = { schemaVersion: 1, masterVersion: 1, revision: 1, lastBackupAt: null, memories: [unknownMemory] };
    await db.put('state', snapshot, 'snapshot');
    expect((await repository.load()).memories[0].cardId).toBe('removed-card');
    const future = { ...snapshot, schemaVersion: 99 };
    await db.put('state', future, 'snapshot');
    await expect(repository.load()).rejects.toThrow('未対応');
    expect(await repository.readRaw()).toEqual(future);
    db.close();
  });
});

describe('backup validation', () => {
  it.each(['not json', '{}', JSON.stringify({ ...createMemoryBackup([]), schemaVersion: 2 }), JSON.stringify({ ...createMemoryBackup([]), masterVersion: 2 })])('rejects malformed or future backup %s', text => {
    expect(() => parseMemoryBackup(text)).toThrow('Backup validation');
  });
  it('rejects duplicate IDs, unknown references, invalid values and extra fields', () => {
    const memory = createMemoryDraft('card-295');
    expect(() => parseMemoryBackup(JSON.stringify(createMemoryBackup([memory, memory])))).toThrow('重複');
    expect(() => parseMemoryBackup(JSON.stringify(createMemoryBackup([createMemoryDraft('missing')])))).toThrow('不明');
    memory.bonuses.vo.lesson = 999;
    expect(() => parseMemoryBackup(JSON.stringify(createMemoryBackup([memory])))).toThrow('不明');
    expect(() => parseMemoryBackup(JSON.stringify({ ...createMemoryBackup([]), unexpected: true }))).toThrow('形式');
  });
});
