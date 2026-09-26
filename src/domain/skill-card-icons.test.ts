import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { memoryMaster } from './memory-master';
import { skillCardIconSrc } from './skill-card-icons';

const ICON_DIR = 'public/skill-card-icons';

describe('skill card icons committed for the master', () => {
  it('provides one WebP icon per master card, without stale leftovers', () => {
    const files = readdirSync(ICON_DIR).filter((name) => name.endsWith('.webp'));
    expect(new Set(files).size).toBe(files.length);
    expect(new Set(files)).toEqual(new Set(memoryMaster.cards.map((card) => `${card.id}.webp`)));
  });
  it('resolves icon paths from the site root by card ID', () => {
    expect(skillCardIconSrc('card-24')).toBe('/skill-card-icons/card-24.webp');
    expect(skillCardIconSrc('card-295')).toBe('/skill-card-icons/card-295.webp');
  });
});
