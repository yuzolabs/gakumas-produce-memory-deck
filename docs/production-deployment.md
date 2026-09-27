# 本番デプロイと正式リリース

staging で検証した Immutable な beta Release を、本番 Pages へ昇格します。
アプリの再ビルド、単体テスト、E2E テストは本番ワークフローでは実行しません。
公開前には成果物の完全性と検証履歴を確認し、公開後には HTTP で配信内容を確認します。

## 初回の手動設定

1. GitHub の Settings → Releases で `Enable release immutability` を有効にする。
   既存 Release は自動的に Immutable にならないため、新しい beta 版を作成する。
2. 管理者が Pages Direct Upload プロジェクト `gakumas-produce-memory-deck` を作成する。
   Production branch は `main` にする。staging 用プロジェクトとは別にする。
3. URL が `https://gakumas-produce-memory-deck.pages.dev` と一致することを確認する。
   別の URL が割り当てられた場合は、本番 URL・プロジェクト名をコード側も合わせて変更する。
4. GitHub Environment の `production` を作成する。
   許可ブランチを `main` に限定し、利用プランで可能なら Required reviewers を設定する。
5. `production` の Environment secrets に次の値を登録する。

   | 名前 | 内容 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 本番アカウントの Pages 用書き込みトークン |
   | `CLOUDFLARE_ACCOUNT_ID` | 本番 Pages プロジェクトのアカウント ID |

本番 URL はコードで固定しています。`PRODUCTION_URL` などの Environment variable は不要です。
Cloudflare のリソース作成や認証情報登録は、この実装では自動実行しません。
Pages トークンの権限は他のプロジェクトにも及ぶ可能性があります。
GitHub Environment の分離だけで Cloudflare 側の権限を分離できるとは限りません。
厳密な分離が必要なら、staging と本番の Cloudflare アカウントを分けてください。

## beta 版を用意する

[staging デプロイ](staging-deployment.md) の手順で新しい beta 版を作成します。
たとえば `v0.1.0-beta.2` を指定し、ワークフローの成功を確認します。

新しい beta Release には、次の3ファイルを添付します。

| Asset | 内容 |
| --- | --- |
| `site.tar.gz` | staging で公開・検証した静的サイト |
| `manifest.json` | 形式バージョン、beta 版、コミット、staging 実行 ID・attempt、全ファイルの SHA-256 |
| `SHA256SUMS` | アーカイブと manifest の SHA-256 |

これらを Draft に添付してから Pre-release として公開します。
公開後に Immutable と release attestation を確認します。
Artifacts は一時的なジョブ間受け渡しにも使いません。
このため staging は同じジョブでビルドから Release 公開まで行い、ジョブに `contents: write` を付与します。
チェックアウトの認証情報は永続化せず、GitHub API トークンは Release 処理のステップにだけ明示的に渡します。

既存の Assets なし Release、mutable Release、単独のタグは本番昇格に使えません。
旧版へファイルを後付けするのではなく、この方式で新しい beta 版を作成してください。
Release 本文や Pre-release フラグだけを検証済みの証拠にはしません。

## 本番への昇格

1. GitHub の Actions → Deploy production → Run workflow を開く。
2. ブランチは `main` を選ぶ。
3. `beta_version` に検証済みの `v0.1.0-beta.2` などを指定する。
4. `Verify beta provenance` の成功後、Environment のデプロイを承認する。
5. ワークフローの成功、本番サイト、正式 Release を確認する。

`v0.1.0-beta.2` から正式バージョン `v0.1.0` を自動的に導出します。
beta Release とタグは保持し、同じコミットへ正式タグを追加します。
最新の `main` ではなく、指定した beta 版の成果物を公開します。
ワークフローと昇格スクリプトは実行時の `main` を使い、beta のソースコードは実行しません。

### 実行順序

1. beta Release の公開状態・Pre-release 区分・Immutable 属性を確認する。
2. GitHub CLI の `release verify`・`release verify-asset` で、署名付き attestation に基づき Release と全 Assets を検証する。
3. チェックサム、タグのコミット、manifest、アーカイブ全体を照合する。
4. 指定された staging ワークフローが同じリポジトリの `main` で手動実行され、成功したことを確認する。
5. 記録された attempt の `Verify deployed staging site` ステップも成功していることを確認する。
6. `production` Environment の承認後、もう一度昇格元を検証する。
7. 本番用メタデータだけを変更し、正式版の Draft と全 Assets を用意する。
8. Draft からダウンロードし直した成果物を再検証して、本番 Pages へ公開する。
9. 本番 URL、バージョン、コミット、直接アクセス、代表的な JS・画像、ヘッダーを HTTP で確認する。
10. Draft を正式 Release として公開し、Immutable と attestation を確認する。Latest に指定する。

本番ワークフローでも Wrangler 用の依存関係は lockfile どおりにインストールします。
ライフサイクルスクリプトは無効にし、アプリのビルド・テストは行いません。
本番用の Pages 設定は `.release/production/` に生成し、staging 用の `wrangler.jsonc` と分離します。
Cloudflare トークンは公開ステップだけに渡します。

### 本番用に変更するもの

- `_headers`: staging 専用の `noindex, nofollow` を除去する。`deployment.json` の `no-store` は維持する。
- `deployment.json`: 正式バージョン、コミット、昇格元 beta を記録する。

HTML・JS・CSS・画像・フォントは変更しません。
本番 Release の `site.tar.gz` は、実際に公開した本番用ファイルを保存します。
本番 manifest には昇格元 Release ID、beta 版、元アーカイブのダイジェスト、staging 実行情報も記録します。
beta 版と本番版はメタデータが異なるため、アーカイブのダイジェストも異なります。
展開時はパストラバーサル、リンク、重複エントリ、Pages の実行コード、サイズ超過を拒否します。
現在の上限は10,000ファイル、展開後合計200 MiB です。

## 失敗時と再実行

| 状況 | 動作・対応 |
| --- | --- |
| 成果物・attestation・staging 履歴の検証失敗 | 本番を更新しない。検証を省略せず、原因を確認する |
| CLI が release 検証に未対応 | 失敗として停止する。対応版 GitHub CLI を使う |
| Draft の添付途中で失敗 | 同じ昇格元の再実行で、不足分だけ添付する |
| Draft に異なるコミット・Assets がある | 上書きせず停止する。管理者が Draft を調査する |
| 公開後の HTTP 確認失敗 | 本番は更新済みだが正式版は Draft のまま。自動ロールバックはしない |
| Release 公開だけ失敗 | 同じ実行の失敗ジョブを再実行する。再検証・再デプロイ・公開確認を経て再試行する |
| 同一の正式版が既に公開済み | 元 beta と全 Assets を検証し、デプロイをスキップする |
| 同じ正式版へ別 beta を指定 | コミットが同じでも拒否する |
| より新しい正式版が公開済み | 古い版への通常昇格を拒否する |

公開済み Release やタグは変更・削除しません。`--clobber` は使いません。
Draft やタグの存在だけでは、本番公開の成功を意味しません。
GitHub の Release 公開と Cloudflare デプロイは単一トランザクションではないため、途中失敗は上表の手順で回復します。

staging の Release 公開後に attestation の反映遅延などでワークフローが失敗した場合は、元の staging 実行を再試行してください。
再試行で成果物が一致すれば元の manifest を保持して完了します。別の成果物で上書きはしません。
本番では、元の smoke 成功 attempt と、最終的に成功した同じ workflow run を照合します。
別の新規実行を始めただけでは、失敗した元実行の成功証明にはなりません。

Release immutability を無効にしないでください。
この実装は管理者権限の必要な設定 API を操作せず、公開後の Immutable 状態と署名検証で確認します。
設定を無効にすると、公開後の処理は失敗する可能性があります。その mutable Release は本番昇格できません。
Release 全体やワークフロー履歴を管理者が削除した場合も、検証できないため昇格できません。

## ロールバック

本番障害時は、新しい昇格を止めた上で、管理者が Pages の本番プロジェクトから直前の正常な deployment にロールバックします。
ロールバック先のバージョン・コミットを確認し、`deployment.json` と画面を確認してください。
復旧に伴って正式タグや Release Assets を書き換えません。
同じ公開済み正式版を指定したワークフローは再デプロイしないため、ロールバック操作の代わりにはなりません。

## ローカルでの実装検証

```bash
bun run test:release
bun run check
bun run format:check
```

`test:release` は Python 3.11 以降の標準ライブラリだけで動作します。
GitHub・Cloudflare への書き込みをせず、完全性、改変拒否、安全な展開、再試行、昇格処理を検証します。
本番スクリプトを手元で実行すると Draft 作成などの書き込みを伴うため、通常は Actions から操作してください。

## 参考

- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [gh release verify](https://cli.github.com/manual/gh_release_verify)
- [gh release verify-asset](https://cli.github.com/manual/gh_release_verify-asset)
- [Pages rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/)
