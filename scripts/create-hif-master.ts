import { writeFile } from 'node:fs/promises';
import skillMaster from '../src/data/skill-master.json';

// Reviewed transcription of factual card/effect relationships, not runtime scraping.
const groups = [
  [
    'sense',
    'remove-sleep',
    'ひと呼吸・ペース配分・スタートダッシュ・スタンドプレー・シュプレヒコール・破竹の勢い・演出計画・願いの力・静かな意志・存在感・スポットライト・精神統一',
  ],
  [
    'sense',
    'extra-draw',
    'ハイタッチ・トークタイム・軌道修正・パンプアップ・エキサイト・決めポーズ・飛躍・祝福・立ち位置チェック・眼力・大声援・始まりの合図・意地・成功への道筋',
  ],
  [
    'sense',
    'extra-use',
    '軽い足取り・愛嬌・準備運動・ファンサ・勢い任せ・バランス感覚・楽観的・深呼吸・アドリブ・情熱ターン',
  ],
  [
    'logic',
    'remove-sleep',
    'デイドリーミング・キラメキ・みんな大好き・ファンシーチャーム・ワクワクが止まらない・本番前夜・ひなたぼっこ・ゆめみごこち・止められない想い・オトメゴコロ',
  ],
  [
    'logic',
    'extra-draw',
    'ゆるふわおしゃべり・手拍子・元気な挨拶・おまもりミラクル・がむしゃら・リズミカル・幸せのおまじない・イメチェン・ありがとうの言葉・ハートの合図・イメトレ・やる気は満点',
  ],
  [
    'logic',
    'extra-use',
    '今日もおはよう・もう少しだけ・リスタート・えいえいおー・思い出し笑い・パステル気分・励まし・ラブリーウインク・きらきら紙吹雪・あふれる思い出・ふれあい・幸せな時間',
  ],
  [
    'anomaly',
    'remove-sleep',
    '形勢逆転・セッティング・第一印象・始まりの笑顔・トレンドリーダー・モチベ・プライド・盛り上げ上手・インフルエンサー・切磋琢磨・タフネス・達成感',
  ],
  [
    'anomaly',
    'extra-draw',
    'ジャストアピール・一歩・ラッキー♪・精一杯・ノンストップ・ハッスル・ハッピー♪・嬉しい誤算・涙の思い出・巻き返し・はじけるパッション・汗と成長・オープニングアクト・理想のテンポ・トレーニングの成果・アンダンテ・潜在能力・カウントダウン・忍耐力',
  ],
  ['anomaly', 'extra-use', 'スターライト・積み重ね・せーのっ！・アッチェレランド'],
];
const effects: Record<string, { name: string; label: string }> = {
  'remove-sleep': { name: '眠気を除外', label: '試験ごと1回：山札か捨札の眠気をランダムに除外' },
  'extra-draw': { name: '使用数追加・ドロー', label: '試験ごと1回：使用数+1・1枚ドロー' },
  'extra-use': { name: '使用数追加', label: '試験ごと2回：使用数+1' },
};
const abilities = groups.flatMap(([plan, effectId, names]) =>
  names.split('・').map((name) => {
    const card = skillMaster.cards.find((c) => c.name === name && c.plan === plan && !c.upgraded);
    if (!card) throw new Error(`HIF master: 対象カードが見つかりません: ${name}`);
    return {
      id: `hif-${card.id}`,
      targetCardId: card.id,
      plan,
      effectId,
      name: `${name}使用後：${effects[effectId].name}`,
      retired: false,
      values: [{ id: 'standard', label: effects[effectId].label, retired: false }],
    };
  }),
);
await writeFile(
  'src/data/hif-master.json',
  JSON.stringify(
    {
      version: 1,
      source: 'https://wikiwiki.jp/gakumas/HIF/メモリーアビリティ',
      abilities,
    },
    null,
    2,
  ) + '\n',
);
console.log(`HIF master: ${abilities.length} abilities`);
