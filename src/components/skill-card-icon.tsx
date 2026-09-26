import type { SkillCard } from '../domain/memory-master';
import { skillCardIconSrc } from '../domain/skill-card-icons';

/**
 * Decorative card art. The card name is always rendered as adjacent text,
 * so the image stays hidden from assistive technology.
 */
export function SkillCardIcon({ card, className }: { card: SkillCard; className?: string }) {
  return (
    <img
      src={skillCardIconSrc(card.id)}
      alt=""
      width={96}
      height={96}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
