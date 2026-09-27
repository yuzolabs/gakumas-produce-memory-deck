# Cloudflare Agent Skills の取得元

- リポジトリ: <https://github.com/cloudflare/skills>
- コミット: `626547c06881a20b3322bdc2ed6e6451b33a4fb6`
- ライセンス: Apache-2.0。原文は [cloudflare-skills-LICENSE.txt](cloudflare-skills-LICENSE.txt) に同梱。

## 取り込んだスキル

| upstream のパス | 配置先 | 用途 |
| --- | --- | --- |
| `skills/cloudflare/` | `.agents/skills/cloudflare/` | Workers Static Assets の選定・構成とストレージの使い分け |
| `skills/wrangler/` | `.agents/skills/wrangler/` | staging の設定、ローカル検証、デプロイ、認証情報の扱い |
| `skills/workers-best-practices/` | `.agents/skills/workers-best-practices/` | Workers の設定・安全性・互換性のレビュー |

各ディレクトリは参照ファイルを含めて原文のままコピーしています。
upstream の整形を維持するため、取り込んだファイルには自動整形を適用しません。
更新時は取得元コミットを固定してディレクトリ全体を置換し、この記録も更新してください。

`cloudflare` から参照される兄弟スキルは任意です。
未導入のスキルについては、スキル本文の指示どおり公式ドキュメントを参照します。
AI、Next.js、Durable Objects、Cloudflare One、性能監査などの専用スキルは今回のデプロイには不要なため取り込んでいません。

## このプロダクトでの適用範囲

サイトは React と Vite による SPA です。
画像は静的アセットとして同梱し、ユーザーデータは IndexedDB に保存します。
スキルに例示された D1、R2、AI などのサービスを自動的に導入する意図はありません。
Cloudflare 認証情報は管理者が手動登録します。
