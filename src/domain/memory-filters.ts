import { memoryMaster, type MemoryMaster, type SkillCard } from './memory-master';
import type { ProduceMemory } from './produce-memory';

/** All detail predicates must match the same physical memory. */
export interface MemoryFilters {
  query: string;
  ownership: string;
  plan: string;
  timing: string;
  customId: string;
  customValueId: string;
  hif: string;
  hifId: string;
  voLesson: number;
  daLesson: number;
  viLesson: number;
  voInitial: number;
  daInitial: number;
  viInitial: number;
  sort: string;
}
/** Zero thresholds mean no bonus restriction, including unowned cards. */
export const emptyMemoryFilters: MemoryFilters = {
  query: '',
  ownership: '',
  plan: '',
  timing: '',
  customId: '',
  customValueId: '',
  hif: '',
  hifId: '',
  voLesson: 0,
  daLesson: 0,
  viLesson: 0,
  voInitial: 0,
  daInitial: 0,
  viInitial: 0,
  sort: 'name',
};
/** Records remain whole when filtered; no cross-record maxima are computed. */
export function matchesMemoryFilters(memory: ProduceMemory, filters: MemoryFilters): boolean {
  if (filters.timing && memory.acquisitionTimingId !== filters.timing) return false;
  if (
    filters.customId &&
    !memory.customizations.some(
      (c) =>
        c.definitionId === filters.customId &&
        (!filters.customValueId || c.valueId === filters.customValueId),
    )
  )
    return false;
  if ((filters.hif === 'yes' && !memory.hif) || (filters.hif === 'no' && memory.hif)) return false;
  if (filters.hifId && memory.hif?.abilityId !== filters.hifId) return false;
  return (
    memory.bonuses.vo.lesson >= filters.voLesson &&
    memory.bonuses.da.lesson >= filters.daLesson &&
    memory.bonuses.vi.lesson >= filters.viLesson &&
    memory.bonuses.vo.initial >= filters.voInitial &&
    memory.bonuses.da.initial >= filters.daInitial &&
    memory.bonuses.vi.initial >= filters.viInitial
  );
}
/** A card group contains owned copies and matching copies separately for honest counts. */
export interface MemoryCardGroup {
  card: SkillCard;
  owned: ProduceMemory[];
  matching: ProduceMemory[];
}

/** Search includes unowned cards unless a predicate requires an actual memory. */
export function filterMemoryCards(
  memories: ProduceMemory[],
  filters: MemoryFilters,
  master: MemoryMaster = memoryMaster,
): MemoryCardGroup[] {
  const normalized = filters.query.normalize('NFKC').toLocaleLowerCase('ja').trim();
  const hasDetails = Boolean(
    filters.timing ||
    filters.customId ||
    filters.hif ||
    filters.hifId ||
    filters.voLesson ||
    filters.daLesson ||
    filters.viLesson ||
    filters.voInitial ||
    filters.daInitial ||
    filters.viInitial,
  );
  const byCard = new Map<string, ProduceMemory[]>();
  for (const memory of memories)
    byCard.set(memory.cardId, [...(byCard.get(memory.cardId) ?? []), memory]);
  const groups = master.cards.flatMap((card) => {
    const owned = (byCard.get(card.id) ?? []).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    if (card.retired && !owned.length) return [];
    if (
      !card.name.normalize('NFKC').toLocaleLowerCase('ja').includes(normalized) ||
      (filters.plan && card.plan !== filters.plan)
    )
      return [];
    if (
      (filters.ownership === 'owned' && !owned.length) ||
      (filters.ownership === 'unowned' && owned.length)
    )
      return [];
    const matching = owned.filter((m) => matchesMemoryFilters(m, filters));
    if (hasDetails && !matching.length) return [];
    return [{ card, owned, matching }];
  });
  return groups.sort((a, b) => {
    if (filters.sort === 'owned' && a.owned.length !== b.owned.length)
      return b.owned.length - a.owned.length;
    if (filters.sort === 'updated') {
      const difference =
        (b.owned[0] ? Date.parse(b.owned[0].updatedAt) : 0) -
        (a.owned[0] ? Date.parse(a.owned[0].updatedAt) : 0);
      if (difference) return difference;
    }
    return a.card.name.localeCompare(b.card.name, 'ja');
  });
}
