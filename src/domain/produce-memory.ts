import { z } from 'zod';
import {
  customizationIdSchema,
  hifAbilityIdSchema,
  memoryMaster,
  skillCardIdSchema,
  type MemoryMaster,
} from './memory-master';

/** Memory IDs identify individual owned copies, not cards. */
export const produceMemoryIdSchema = z.string().uuid().brand<'ProduceMemoryId'>();
const bonusValueSchema = z.strictObject({
  lesson: z.number().finite().nonnegative(),
  initial: z.number().finite().nonnegative(),
});
/** Structural validation intentionally accepts unknown master IDs without dropping them. */
export const produceMemorySchema = z.strictObject({
  id: produceMemoryIdSchema,
  cardId: skillCardIdSchema,
  acquisitionTimingId: z.string().min(1),
  customizations: z.array(
    z.strictObject({ definitionId: customizationIdSchema, valueId: z.string().min(1) }),
  ),
  hif: z.strictObject({ abilityId: hifAbilityIdSchema, valueId: z.string().min(1) }).nullable(),
  bonuses: z.strictObject({ vo: bonusValueSchema, da: bonusValueSchema, vi: bonusValueSchema }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** Numeric bonus percentages use percentage points (2.1 means 2.1%). */
export type ProduceMemory = z.infer<typeof produceMemorySchema>;
/** Branded memory IDs cannot be accidentally substituted with card IDs. */
export type ProduceMemoryId = ProduceMemory['id'];

/** Creates an unsaved draft; no owned data is written until the user confirms. */
export function createMemoryDraft(cardId = '', master = memoryMaster): ProduceMemory {
  const now = new Date().toISOString();
  return {
    id: produceMemoryIdSchema.parse(crypto.randomUUID()),
    cardId: cardId as ProduceMemory['cardId'],
    acquisitionTimingId: master.acquisitionTimings.find((t) => !t.retired)!.id,
    customizations: [],
    hif: null,
    bonuses: {
      vo: { lesson: 0, initial: 0 },
      da: { lesson: 0, initial: 0 },
      vi: { lesson: 0, initial: 0 },
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Checks combinations within one memory; archived choices are allowed only for history. */
export function getMemoryIssues(
  memory: ProduceMemory,
  master: MemoryMaster = memoryMaster,
  allowRetired = true,
): string[] {
  const issues: string[] = [];
  const card = master.cards.find((c) => c.id === memory.cardId);
  if (!card) issues.push(`不明なカードID: ${memory.cardId || '未選択'}`);
  else if (!allowRetired && card.retired) issues.push('このカードは新規登録できません');
  const timing = master.acquisitionTimings.find((t) => t.id === memory.acquisitionTimingId);
  if (!timing || (!allowRetired && timing.retired)) issues.push('取得タイミングを選択してください');
  let cost = 0;
  const selectedIds = new Set<string>();
  for (const selected of memory.customizations) {
    const definition = master.customizations.find((c) => c.id === selected.definitionId);
    const value = definition?.values.find((v) => v.id === selected.valueId);
    if (!definition || !value)
      issues.push(`不明なカスタム: ${selected.definitionId} / ${selected.valueId}`);
    else {
      cost += value.cost;
      if (!allowRetired && (definition.retired || value.retired))
        issues.push('廃止されたカスタムは新規選択できません');
    }
    if (selectedIds.has(selected.definitionId)) issues.push('同じカスタムが重複しています');
    selectedIds.add(selected.definitionId);
    if (card && !card.customizationIds.includes(selected.definitionId))
      issues.push('このカードに対応しないカスタムです');
  }
  if (card && cost > card.maxCustomizations)
    issues.push(`カスタムは合計${card.maxCustomizations}段階までです`);
  if (memory.hif) {
    const ability = master.abilities.find((a) => a.id === memory.hif!.abilityId);
    const value = ability?.values.find((v) => v.id === memory.hif!.valueId);
    if (!ability || !value) issues.push(`不明なHIFアビリティ: ${memory.hif.abilityId}`);
    else {
      if (card && card.plan !== 'free' && card.plan !== ability.plan)
        issues.push('カードとHIFアビリティのプランが一致しません');
      if (!allowRetired && (ability.retired || value.retired))
        issues.push('廃止されたHIFアビリティは新規選択できません');
    }
  }
  let slots = 0;
  for (const attribute of master.attributes)
    for (const definition of master.bonusDefinitions) {
      const value = memory.bonuses[attribute.id][definition.id];
      if (!definition.values.includes(value))
        issues.push(`${attribute.label}の${definition.label}に不明な値があります: ${value}`);
      if (!allowRetired && definition.retiredValues.includes(value))
        issues.push(`${attribute.label}の${definition.label}の値は廃止されています: ${value}`);
      if (value > 0) slots++;
    }
  if (memory.hif && slots > master.hifBonusSlots)
    issues.push(`HIF付きメモリーの通常アビリティは${master.hifBonusSlots}枠までです`);
  if (!memory.hif && slots > master.normalBonusSlots)
    issues.push(`通常アビリティは${master.normalBonusSlots}枠までです`);
  if (memory.updatedAt < memory.createdAt) issues.push('更新日時が登録日時より前です');
  return issues;
}

/** Unknown definitions stay visible by ID instead of disappearing from comparisons. */
export function describeMemoryCustomizations(memory: ProduceMemory, master = memoryMaster): string {
  return (
    memory.customizations
      .map((selected) => {
        const definition = master.customizations.find((c) => c.id === selected.definitionId);
        return `${definition?.name ?? selected.definitionId} ${definition?.values.find((v) => v.id === selected.valueId)?.label ?? selected.valueId}`;
      })
      .join(' / ') || 'なし'
  );
}

/** HIF descriptions include both trigger card and fixed effect/count. */
export function describeMemoryHif(memory: ProduceMemory, master = memoryMaster): string {
  if (!memory.hif) return 'なし';
  const ability = master.abilities.find((a) => a.id === memory.hif!.abilityId);
  return ability
    ? `${ability.name}（${ability.values.find((v) => v.id === memory.hif!.valueId)?.label ?? memory.hif.valueId}）`
    : `不明なID: ${memory.hif.abilityId}`;
}
