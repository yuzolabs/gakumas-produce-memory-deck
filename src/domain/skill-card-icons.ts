/**
 * Card icons are committed in `public/skill-card-icons/` as `<cardId>.webp`
 * and served from the site root, so the app never fetches game data at runtime.
 */
export function skillCardIconSrc(cardId: string): string {
  return `/skill-card-icons/${encodeURIComponent(cardId)}.webp`;
}
