import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import headingFontCharacters from './heading-font-characters.json';

const sourceDirectory = fileURLToPath(new URL('../', import.meta.url));

describe('heading font subset', () => {
  it('covers UI text, including conditional headings and dialog titles', () => {
    const supported = new Set(headingFontCharacters);
    const missing = new Set<string>();
    for (const path of readdirSync(sourceDirectory, { recursive: true })) {
      if (typeof path !== 'string' || !path.endsWith('.tsx')) continue;
      for (const character of readFileSync(`${sourceDirectory}/${path}`, 'utf8')) {
        if (character.trim() && !supported.has(character)) missing.add(character);
      }
    }
    expect([...missing], 'Heading font: run bun run fonts:build after changing UI text').toEqual(
      [],
    );
  });

  it('ships one small WOFF2 instead of the full Fontsource stylesheet', () => {
    expect(statSync(new URL('./heading-font.woff2', import.meta.url)).size).toBeLessThan(80_000);
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(styles).not.toContain("@import '@fontsource/zen-maru-gothic/700.css'");
    expect(styles.match(/@font-face/g)).toHaveLength(1);
    expect(styles).toContain('font-display: swap');
  });
});
