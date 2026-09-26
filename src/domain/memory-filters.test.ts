import { describe, expect, it } from 'vitest';
import { emptyMemoryFilters, filterOwnedMemoryCards } from './memory-filters';
import { createMemoryDraft } from './produce-memory';
import { memoryMaster } from './memory-master';

describe('owned-card and same-memory filtering', () => {
  it('sorts timestamps with different fractional-second precision chronologically', () => {
    const earlier = createMemoryDraft('card-295');
    earlier.updatedAt = '2026-01-01T00:00:00Z';
    const later = createMemoryDraft('card-295');
    later.updatedAt = '2026-01-01T00:00:00.123Z';
    const groups = filterOwnedMemoryCards([earlier, later], {
      ...emptyMemoryFilters,
      sort: 'updated',
    });
    expect(groups[0].owned).toEqual([later, earlier]);
  });
  it('does not synthesize a nonexistent combination from separate owned copies', () => {
    const customMemory = createMemoryDraft('card-295');
    customMemory.customizations = [
      {
        definitionId: memoryMaster.customizations.find((c) => c.id === 'custom-52')!.id,
        valueId: '2',
      },
    ];
    const bonusMemory = createMemoryDraft('card-295');
    bonusMemory.bonuses.vo.lesson = 3.5;
    const filters = { ...emptyMemoryFilters, customId: 'custom-52', voLesson: 3.5 };
    expect(filterOwnedMemoryCards([customMemory, bonusMemory], filters)).toEqual([]);
    customMemory.bonuses.vo.lesson = 3.5;
    const result = filterOwnedMemoryCards([customMemory, bonusMemory], filters);
    expect(result).toHaveLength(1);
    expect(result[0].matching).toEqual([customMemory]);
    expect(result[0].owned).toHaveLength(2);
  });
  it('never displays unowned cards, even with default or reset filters', () => {
    expect(filterOwnedMemoryCards([], emptyMemoryFilters)).toEqual([]);
    const memory = createMemoryDraft('card-295');
    const groups = filterOwnedMemoryCards([memory], { ...emptyMemoryFilters });
    expect(groups.map((group) => group.card.id)).toEqual(['card-295']);
    expect(filterOwnedMemoryCards([], { ...emptyMemoryFilters, hif: 'no' })).toEqual([]);
    expect(filterOwnedMemoryCards([], { ...emptyMemoryFilters, timing: 'start' })).toEqual([]);
  });
  it('keeps retired owned cards visible without adding unowned retired cards', () => {
    const master = structuredClone(memoryMaster);
    master.cards.forEach((card) => {
      card.retired = true;
    });
    const memory = createMemoryDraft('card-295');
    const groups = filterOwnedMemoryCards([memory], emptyMemoryFilters, master);
    expect(groups.map((group) => group.card.id)).toEqual(['card-295']);
    expect(groups[0].owned).toEqual([memory]);
  });
  it('filters both acquisition timings, custom levels and bonus units independently', () => {
    const memory = createMemoryDraft('card-295');
    memory.acquisitionTimingId = 'after-first-exam';
    memory.bonuses.vo.initial = 20;
    expect(filterOwnedMemoryCards([memory], { ...emptyMemoryFilters, timing: 'start' })).toEqual(
      [],
    );
    expect(filterOwnedMemoryCards([memory], { ...emptyMemoryFilters, voLesson: 1.4 })).toEqual([]);
    expect(filterOwnedMemoryCards([memory], { ...emptyMemoryFilters, voInitial: 20 })).toHaveLength(
      1,
    );
    expect(
      filterOwnedMemoryCards([memory], { ...emptyMemoryFilters, timing: 'after-first-exam' }),
    ).toHaveLength(1);
  });
});
