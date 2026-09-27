# staging デプロイ

GitHub Actions を手動実行し、Cloudflare Workers Static Assets に公開します。
公開先の動作確認が成功すると、デプロイしたコミットの beta タグと GitHub Pre-release を作成します。
本番環境へのデプロイ、D1、R2 は設定していません。画像はサイトに同梱します。

## 初回の手動設定

この設定は管理者が行います。認証情報をリポジトリへコミットしないでください。

1. Cloudflare アカウントで Workers を利用可能にし、`workers.dev` サブドメインを設定する。
2. Workers プロダクト単位の `Admin` 権限を持つ管理者が、ダッシュボードの Workers & Pages から Worker を作成する。
   名前は `gakumas-produce-memory-deck-staging` とする。初期内容は Hello World でよい。
   本番 Worker は作成・変更しない。
3. アカウント所有の API トークンを作成する。
   Workers の `Editor` ロールを、手順2で作成した単一の Worker にだけ付与する。
   アカウント全体や Workers プロダクト全体を対象にしない。
4. GitHub の Settings → Environments で `staging` を作成する。
5. Deployment branches and tags を `Selected branches and tags` にし、ブランチ `main` だけを許可する。
6. デプロイ前に別の管理者の確認を求める場合は、利用プランで使用できる承認ルールを設定する。
7. `staging` の Environment secrets に次の値を登録する。

   | 名前 | 値 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 手順3で作成した API トークン |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

8. `staging` の Environment variables に `STAGING_URL` を登録する。
   値は `https://gakumas-produce-memory-deck-staging.<サブドメイン>.workers.dev` とし、末尾の `/` は付けない。
9. この変更を `main` にマージする。手動実行するワークフローはデフォルトブランチに存在する必要がある。

新規 Worker の作成にはプロダクト単位の `Admin` が必要ですが、既存 Worker のデプロイには対象 Worker の `Editor` を使えます。
管理者用の資格情報を Actions に登録しないでください。Worker が存在しない場合は、管理者が作成してから再実行します。
権限エラーを解消する目的で、CI トークンを全 Worker の Admin に変更しないでください。
この構成は `workers.dev` を使い、独自ドメイン・Routes・D1・R2 の権限は付与しません。
Cloudflare 側の Git 連携や自動デプロイは設定しません。
Worker 名は `wrangler.staging.jsonc` に固定しています。
名前を変える場合は URL の検証処理と `STAGING_URL` も更新してください。

## 手動実行

1. GitHub の Actions → Deploy staging → Run workflow を開く。
2. ブランチは `main` を選ぶ。他のブランチではデプロイしない。
3. `version` に `v0.1.0-beta.1` のような未使用の beta タグを入力する。
4. ワークフローを実行し、承認ルールを設定している場合は Environment のデプロイを承認する。
5. 完了後、実行サマリーの URL と GitHub Releases を確認する。

処理の順序は次のとおりです。

1. バージョン、公開先 URL、既存タグとコミットの一致を検査する。
2. 固定された Bun と lockfile で依存関係をインストールする。
3. 型検査、単体テスト、マスター検証、ビルド、整形検査、ローカル E2E テストを実行する。
4. `bun run build:staging` で再ビルドし、`deployment.json` と staging 専用の `_headers` を生成する。
5. `bun run verify:staging:local` で Wrangler の dry-run とローカルランタイムのスモークテストを実行する。
6. 検証済みの `dist/` を再ビルドせずにデプロイする。Cloudflare 認証情報はこのステップにだけ渡す。
7. 公開先でも同じスモークテストを実行し、コミット、画像、SPA の直接アクセス、登録・編集・バックアップ画面を検証する。
8. 同じコミットのタグと Pre-release を作成する。Latest には指定しない。

同時実行は直列化します。実行中のデプロイは、新しい実行が来てもキャンセルしません。
GitHub の concurrency は全要求の FIFO キューではありません。保留中の実行は置き換わる場合があります。

## 失敗時と再実行

- デプロイ前の検査に失敗した場合、公開先を更新しません。
- デプロイ後の動作確認に失敗した場合、Release を作りません。ただし公開先は更新済みで、自動ロールバックは行いません。
- Release 作成だけ失敗した場合は、その実行の `Re-run failed jobs` で再試行できます。
- 同じタグ・同じコミットの再実行は許可します。公開済みの Pre-release は変更しません。
- 別コミットを指すタグや、既存の正式 Release は上書きしません。
- 修正コミットをデプロイするときは、新しい beta タグを指定してください。

staging の固定 URL は、次のデプロイで内容が変わります。
Release は過去の公開状態を保証する URL ではなく、検証済みコミットの記録です。
認証情報なしでは実際の Cloudflare デプロイを検証できません。
初回実行時には、権限と公開先を管理者が確認してください。

## ローカルでの確認

```bash
bun install --frozen-lockfile
bun run check
bun run format:check
bunx playwright install chromium
bun run test:e2e
BETA_TAG=v0.1.0-beta.1 bun run deploy:staging:dry-run
```

`deploy:staging:dry-run` は Cloudflare に公開しません。
新しいビルドと公開用ファイルを生成し、Wrangler の dry-run の後、`127.0.0.1:4180` でローカル検証します。
Playwright が `wrangler dev --local` を起動・終了します。既存サーバーの使い回しやリモート binding は行いません。
検証では、公開先と同じコミット・画像・SPA ルーティング・`noindex`・`no-store` ヘッダーを確認します。

`build:staging` は `BETA_TAG` を必須とし、チェックアウト中のコミットを記録します。
`EXPECTED_COMMIT` も指定した場合は、チェックアウト中のコミットとの一致を検証します。
通常の `bun run build` には staging 専用ファイルを含めません。

`bun run deploy:staging` も必ず再ビルドとローカル検証を通してから公開します。
ただし、通常の公開は beta Release を作成する Actions から行ってください。
直接 Wrangler を実行するとこれらの検証を省略できるため、日常のデプロイには使いません。
ローカルの未コミット変更はビルドに含まれますが、記録するコミット SHA には反映されません。

認証情報をローカルに保存する場合、`.env`・`.env.*`・`.dev.vars`・`.dev.vars.*` は Git 管理から除外しています。
末尾が `.example` のテンプレートは例外です。テンプレートには実際の認証情報を入れないでください。

公開先の検証だけを実行する場合は、期待するコミットとバージョンを指定します。

```bash
STAGING_URL=https://gakumas-produce-memory-deck-staging.example.workers.dev \
EXPECTED_COMMIT=<デプロイしたコミットの完全なSHA> \
BETA_TAG=v0.1.0-beta.1 \
bun run test:staging
```

## 公開範囲とデータ

- staging は公開 URL です。`noindex` ヘッダーは認証やアクセス制限にはなりません。
- 限定公開が必要なら Cloudflare Access などを追加し、動作確認にも認証を設定してください。
- ブラウザ内の IndexedDB はオリジンごとに分離されます。staging と本番のデータ移行には JSON を使います。
- 動作確認で登録するデータは、テスト専用ブラウザの IndexedDB に保存されます。
- 画像を独立して運用する必要が生じたら R2 を検討します。D1 は画像ファイルの保存先にしません。
- 画像を公開する前に、利用・再配布の条件を確認してください。

## 参考

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [GitHub CLI release create](https://cli.github.com/manual/gh_release_create)
