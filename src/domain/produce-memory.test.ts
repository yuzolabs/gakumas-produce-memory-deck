import { describe, expect, it, vi } from 'vitest';
import { memoryMaster, validateMemoryMaster } from './memory-master';
import { createMemoryDraft, getMemoryIssues, produceMemorySchema } from './produce-memory';

describe('memory master and rules', () => {
  it('creates valid UUID drafts even without a secure context', () => {
    vi.stubGlobal(
      'crypto',
      new Proxy(crypto, {
        get(target, property) {
          if (property === 'randomUUID') return undefined;
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );
    try {
      const ids = new Set(Array.from({ length: 16 }, () => createMemoryDraft().id));
      expect(ids.size).toBe(16);
      expect(createMemoryDraft('card-295').id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('compares timestamps by time rather than fractional-second formatting', () => {
    const memory = createMemoryDraft('card-295');
    memory.createdAt = '2026-01-01T00:00:00Z';
    memory.updatedAt = '2026-01-01T00:00:00.123Z';
    expect(getMemoryIssues(produceMemorySchema.parse(memory))).toEqual([]);
  });
  it('validates all imported references and representative screenshot values', () => {
    expect(validateMemoryMaster(memoryMaster).cards).toHaveLength(328);
    const card = memoryMaster.cards.find((c) => c.name === 'スポットライト+')!;
    const custom = memoryMaster.customizations.find((c) => c.id === 'custom-52')!;
    const ability = memoryMaster.abilities.find((a) => a.targetCardId === 'card-288')!;
    const memory = createMemoryDraft(card.id);
    memory.acquisitionTimingId = 'after-first-exam';
    memory.customizations = [{ definitionId: custom.id, valueId: '2' }];
    memory.hif = { abilityId: ability.id, valueId: 'standard' };
    memory.bonuses = {
      vo: { lesson: 0, initial: 15 },
      da: { lesson: 0, initial: 20 },
      vi: { lesson: 0, initial: 15 },
    };
    expect(getMemoryIssues(produceMemorySchema.parse(memory))).toEqual([]);
  });
  it('rejects duplicates, excess customization levels, and incompatible HIF plans', () => {
    const memory = createMemoryDraft('card-295');
    const custom = memoryMaster.customizations.find((c) => c.id === 'custom-52')!;
    memory.customizations = [
      { definitionId: custom.id, valueId: '2' },
      { definitionId: custom.id, valueId: '2' },
    ];
    memory.hif = {
      abilityId: memoryMaster.abilities.find((a) => a.plan === 'logic')!.id,
      valueId: 'standard',
    };
    expect(getMemoryIssues(memory)).toEqual(
      expect.arrayContaining([
        '同じカスタムが重複しています',
        'カスタムは合計2段階までです',
        'カードとHIFアビリティのプランが一致しません',
      ]),
    );
  });
  it('retains unknown IDs structurally and reports them', () => {
    const memory = produceMemorySchema.parse(createMemoryDraft('removed-card'));
    expect(memory.cardId).toBe('removed-card');
    expect(getMemoryIssues(memory)[0]).toContain('不明なカードID');
  });
  it('accepts archived records, but disallows retired cards in new entries', () => {
    const master = structuredClone(memoryMaster);
    master.cards[0].retired = true;
    const memory = createMemoryDraft(master.cards[0].id);
    expect(getMemoryIssues(memory, master)).toEqual([]);
    expect(getMemoryIssues(memory, master, false)).not.toEqual([]);
  });
  it('reflects new bonus values without a component change', () => {
    const master = structuredClone(memoryMaster);
    master.bonusDefinitions.find((d) => d.id === 'lesson')!.values.push(4.2);
    const memory = createMemoryDraft(master.cards[0].id);
    memory.bonuses.vo.lesson = 4.2;
    expect(getMemoryIssues(memory, validateMemoryMaster(master))).toEqual([]);
    expect(getMemoryIssues(memory)).not.toEqual([]);
  });
  it('retains retired bonus values in history and rejects six normal bonus slots', () => {
    const master = structuredClone(memoryMaster);
    master.bonusDefinitions.find((d) => d.id === 'lesson')!.retiredValues.push(1.4);
    const memory = createMemoryDraft('card-295');
    memory.bonuses.vo.lesson = 1.4;
    expect(getMemoryIssues(memory, master)).toEqual([]);
    expect(getMemoryIssues(memory, master, false)).not.toEqual([]);
    for (const attribute of master.attributes)
      memory.bonuses[attribute.id] = { lesson: 2.1, initial: 15 };
    expect(getMemoryIssues(memory)).toContain('通常アビリティは5枠までです');
  });
  it('rejects broken masters and excessive HIF bonus slots', () => {
    const master = structuredClone(memoryMaster);
    master.cards.push(master.cards[0]);
    expect(() => validateMemoryMaster(master)).toThrow('重複');
    const memory = createMemoryDraft('card-295');
    memory.hif = { abilityId: memoryMaster.abilities[0].id, valueId: 'standard' };
    memory.bonuses.vo = { lesson: 2.1, initial: 15 };
    memory.bonuses.da = { lesson: 2.1, initial: 15 };
    expect(getMemoryIssues(memory)).toContain('HIF付きメモリーの通常アビリティは3枠までです');
  });
});
