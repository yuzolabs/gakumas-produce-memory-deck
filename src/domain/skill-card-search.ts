import type { SkillCard } from './memory-master';

/** Normalizes skill card search text without changing displayed names or IME input. */
export function normalizeSkillCardSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .trim();
}

/** Matches card names or curated readings; blank queries never list every card. */
export function searchSkillCards(cards: SkillCard[], query: string): SkillCard[] {
  const normalized = normalizeSkillCardSearch(query);
  if (!normalized) return [];
  return cards
    .filter(
      (card) =>
        normalizeSkillCardSearch(card.name).includes(normalized) ||
        normalizeSkillCardSearch(card.nameReading).includes(normalized),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
