import { z } from 'zod';
import skillData from '../data/skill-master.json';
import hifData from '../data/hif-master.json';
import optionData from '../data/memory-options.json';

/** Stable card IDs use a namespace and never depend on display names. */
export const skillCardIdSchema = z.string().min(1).brand<'SkillCardId'>();
/** Customization IDs distinguish effects with identical Japanese labels. */
export const customizationIdSchema = z.string().min(1).brand<'CustomizationId'>();
/** HIF IDs refer to the trigger card, independently of the acquired card. */
export const hifAbilityIdSchema = z.string().min(1).brand<'HifAbilityId'>();
const masterValueSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  retired: z.boolean(),
});
const skillCardSchema = z.object({
  id: skillCardIdSchema,
  name: z.string().min(1),
  nameReading: z.string().trim().min(1),
  plan: z.string().min(1),
  kind: z.enum(['active', 'mental']),
  rarity: z.enum(['R', 'SR', 'SSR']),
  upgraded: z.boolean(),
  retired: z.boolean(),
  customizationIds: z.array(customizationIdSchema),
  maxCustomizations: z.number().int().nonnegative(),
});
const memoryMasterSchema = z.object({
  version: z.number().int().positive(),
  cards: z.array(skillCardSchema).min(1),
  customizations: z.array(
    z.object({
      id: customizationIdSchema,
      name: z.string(),
      retired: z.boolean(),
      values: z.array(masterValueSchema.extend({ cost: z.number().int().positive() })).min(1),
    }),
  ),
  abilities: z.array(
    z.object({
      id: hifAbilityIdSchema,
      targetCardId: skillCardIdSchema,
      plan: z.string(),
      effectId: z.string(),
      name: z.string(),
      retired: z.boolean(),
      values: z.array(masterValueSchema).min(1),
    }),
  ),
  plans: z.array(z.object({ id: z.string(), label: z.string() })),
  acquisitionTimings: z.array(masterValueSchema).min(1),
  attributes: z
    .array(z.object({ id: z.enum(['vo', 'da', 'vi']), label: z.string(), name: z.string() }))
    .length(3),
  bonusDefinitions: z
    .array(
      z.object({
        id: z.enum(['lesson', 'initial']),
        label: z.string(),
        unit: z.string(),
        values: z.array(z.number().finite().nonnegative()).min(1),
        retiredValues: z.array(z.number().finite().nonnegative()).default([]),
      }),
    )
    .length(2),
  hifBonusSlots: z.number().int().positive(),
  normalBonusSlots: z.number().int().positive(),
});
/** Master data includes retired choices so historical records remain readable. */
export type MemoryMaster = z.infer<typeof memoryMasterSchema>;
/** A skill card variant (including +) has its own stable ID. */
export type SkillCard = MemoryMaster['cards'][number];

function assertUniqueIds(rows: { id: string }[], context: string) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error(`Master validation: ${context}のIDが重複しています`);
}

/** Validates master structure and every reference before the UI starts. */
export function validateMemoryMaster(input: unknown): MemoryMaster {
  const master = memoryMasterSchema.parse(input);
  for (const key of [
    'cards',
    'customizations',
    'abilities',
    'plans',
    'acquisitionTimings',
    'attributes',
    'bonusDefinitions',
  ] as const)
    assertUniqueIds(master[key], key);
  for (const definition of [...master.customizations, ...master.abilities]) {
    assertUniqueIds(definition.values, definition.id);
    if (!definition.retired && !definition.values.some((v) => !v.retired))
      throw new Error(`Master validation: 有効な選択肢がありません: ${definition.id}`);
  }
  if (!master.acquisitionTimings.some((t) => !t.retired))
    throw new Error('Master validation: 有効な取得タイミングがありません');
  for (const definition of master.bonusDefinitions) {
    if (
      !definition.values.includes(0) ||
      definition.retiredValues.includes(0) ||
      definition.retiredValues.some((v) => !definition.values.includes(v)) ||
      new Set(definition.values).size !== definition.values.length
    )
      throw new Error('Master validation: ボーナスには重複のない値と0が必要です');
  }
  for (const card of master.cards) {
    if (
      !master.plans.some((p) => p.id === card.plan) ||
      new Set(card.customizationIds).size !== card.customizationIds.length ||
      card.customizationIds.some((id) => !master.customizations.some((c) => c.id === id))
    )
      throw new Error(`Master validation: カードの参照が不正です: ${card.id}`);
  }
  for (const ability of master.abilities) {
    const target = master.cards.find((c) => c.id === ability.targetCardId);
    if (!target || target.plan !== ability.plan || target.upgraded)
      throw new Error(`Master validation: HIFの参照が不正です: ${ability.id}`);
  }
  return master;
}

/** Bundled JSON only; the application never fetches game data at runtime. */
export const memoryMaster = validateMemoryMaster({
  ...skillData,
  ...optionData,
  abilities: hifData.abilities,
});
