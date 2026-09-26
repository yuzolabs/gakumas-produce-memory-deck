import { describe, expect, it } from 'vitest';
import { memoryMaster, validateMemoryMaster } from './memory-master';
import { normalizeSkillCardSearch, searchSkillCards } from './skill-card-search';

describe('normalizeSkillCardSearch', () => {
  it.each(['すぽっとらいと', 'スポットライト', ' ｽﾎﾟｯﾄﾗｲﾄ '])(
    'normalizes %s to hiragana',
    (query) => expect(normalizeSkillCardSearch(query)).toBe('すぽっとらいと'),
  );
  it('preserves voiced sounds, long vowels and upgrade markers', () => {
    expect(normalizeSkillCardSearch(' ﾊﾞｽﾞﾜｰﾄﾞ＋ ')).toBe('ばずわーど+');
    expect(normalizeSkillCardSearch('ＡＢＣ')).toBe('abc');
  });
});

describe('searchSkillCards', () => {
  it.each(['すぽっと', 'スポット', 'ｽﾎﾟｯﾄ'])('matches kana variants: %s', (query) => {
    expect(searchSkillCards(memoryMaster.cards, query).map((card) => card.name)).toEqual([
      'スポットライト',
      'スポットライト+',
    ]);
  });
  it.each(['ひとこ', 'ヒトコ', 'ひと呼吸', 'こきゅう'])(
    'matches names or readings: %s',
    (query) => {
      expect(searchSkillCards(memoryMaster.cards, query).map((card) => card.name)).toContain(
        'ひと呼吸',
      );
    },
  );
  it('searches kanji readings and distinguishes upgrades', () => {
    expect(searchSkillCards(memoryMaster.cards, 'あいきょう＋').map((card) => card.name)).toEqual([
      '愛嬌+',
    ]);
  });
  it('returns no matches for blank or unknown queries', () => {
    for (const query of ['', '　 ', '存在しないカード名']) {
      expect(searchSkillCards(memoryMaster.cards, query)).toEqual([]);
    }
  });
  it('does not search outside supplied cards or mutate their ordering', () => {
    const cards = memoryMaster.cards.slice(0, 2).reverse();
    const original = [...cards];
    expect(searchSkillCards(cards, 'かるい')).toHaveLength(2);
    expect(searchSkillCards(cards, 'あいきょう')).toEqual([]);
    expect(cards).toEqual(original);
  });
});

describe('skill card readings', () => {
  it('provides searchable readings without kanji for every card and its upgrade', () => {
    for (const card of memoryMaster.cards) {
      expect(card.nameReading).not.toMatch(/[\p{Script=Han}ァ-ヶ]/u);
      expect(searchSkillCards(memoryMaster.cards, card.nameReading)).toContain(card);
      if (card.upgraded) {
        const base = memoryMaster.cards.find(
          (candidate) => candidate.name === card.name.slice(0, -1),
        );
        expect(card.nameReading).toBe(`${base?.nameReading}+`);
      }
    }
  });
  it('rejects missing or blank readings during master validation', () => {
    for (const nameReading of [undefined, '', '　 ']) {
      const master = structuredClone(memoryMaster);
      Object.assign(master.cards[0], { nameReading });
      expect(() => validateMemoryMaster(master)).toThrow();
    }
  });
});
