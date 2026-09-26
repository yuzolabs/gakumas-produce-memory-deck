import { describe, expect, it } from 'vitest';
import { emptyMemoryFilters, filterMemoryCards } from './memory-filters';
import { createMemoryDraft } from './produce-memory';
import { memoryMaster } from './memory-master';

describe('same-memory filtering', () => {
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
    expect(filterMemoryCards([customMemory, bonusMemory], filters)).toEqual([]);
    customMemory.bonuses.vo.lesson = 3.5;
    const result = filterMemoryCards([customMemory, bonusMemory], filters);
    expect(result).toHaveLength(1);
    expect(result[0].matching).toEqual([customMemory]);
    expect(result[0].owned).toHaveLength(2);
  });
  it('shows unowned cards but does not match them to memory detail conditions', () => {
    expect(filterMemoryCards([], emptyMemoryFilters)).toHaveLength(328);
    expect(filterMemoryCards([], { ...emptyMemoryFilters, hif: 'no' })).toEqual([]);
    expect(filterMemoryCards([], { ...emptyMemoryFilters, timing: 'start' })).toEqual([]);
  });
  it('filters both acquisition timings, custom levels and bonus units independently', () => {
    const memory = createMemoryDraft('card-295');
    memory.acquisitionTimingId = 'after-first-exam';
    memory.bonuses.vo.initial = 20;
    expect(filterMemoryCards([memory], { ...emptyMemoryFilters, timing: 'start' })).toEqual([]);
    expect(filterMemoryCards([memory], { ...emptyMemoryFilters, voLesson: 1.4 })).toEqual([]);
    expect(filterMemoryCards([memory], { ...emptyMemoryFilters, voInitial: 20 })).toHaveLength(1);
    expect(
      filterMemoryCards([memory], { ...emptyMemoryFilters, timing: 'after-first-exam' }),
    ).toHaveLength(1);
  });
});
