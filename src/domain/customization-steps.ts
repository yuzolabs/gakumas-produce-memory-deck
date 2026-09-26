import type { MemoryMaster } from './memory-master';

type CustomizationValue = MemoryMaster['customizations'][number]['values'][number];

/** Steps follow allowed master values; reducing an invalid value remains possible. */
export function getCustomizationSteps(
  values: CustomizationValue[],
  selectedId: string,
  maxCost: number,
) {
  const zero = { id: '', label: 'なし', cost: 0, retired: false };
  const steps = [zero, ...[...values].sort((a, b) => a.cost - b.cost)];
  const index = steps.findIndex((value) => value.id === selectedId);
  const current = steps[index];
  const next = index >= 0 ? steps[index + 1] : undefined;
  return {
    current,
    previous: index < 0 ? zero : steps[index - 1],
    next: next && next.cost <= maxCost ? next : undefined,
  };
}
