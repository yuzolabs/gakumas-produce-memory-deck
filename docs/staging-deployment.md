# staging デプロイ

GitHub Actions を手動実行し、Cloudflare Pages の staging 専用プロジェクトに公開します。
公開先の動作確認が成功すると、デプロイしたコミットの beta タグと GitHub Pre-release を作成します。
本番環境へのデプロイ、D1、R2、Pages Functions は設定していません。画像はサイトに同梱します。

## 初回の手動設定

この設定は管理者が行います。認証情報をリポジトリへコミットしないでください。

1. Cloudflare に staging 専用の Pages プロジェクトを Direct Upload 方式で作成する。
   プロジェクト名は `gakumas-produce-memory-deck-staging`、Production branch は `main` とする。
   Git 連携や自動デプロイは設定しない。本番用のプロジェクトとは分離する。
2. 割り当てられた URL と `https://gakumas-produce-memory-deck-staging.pages.dev` の一致を確認する。
   名前の重複で別の URL になった場合は、後述の設定を変更してから実行する。
3. 対象アカウントの Pages に書き込みできる API トークンを作成する。
   アカウント所有トークンでは Pages 用の `Pages Write` 権限を使う。
   旧形式の画面では `Account / Cloudflare Pages / Edit` に相当する。
   利用可能なスコープを確認し、対象アカウントに限定する。
4. GitHub の Settings → Environments で `staging` を作成する。
5. Deployment branches and tags を `Selected branches and tags` にし、ブランチ `main` だけを許可する。
6. デプロイ前に別の管理者の確認を求める場合は、利用プランで使用できる承認ルールを設定する。
7. `staging` の Environment secrets に次の値を登録する。

   | 名前 | 値 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 手順3で作成した Pages 用 API トークン |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

8. `staging` の Environment variables に `STAGING_URL` を登録する。
   値は `https://gakumas-produce-memory-deck-staging.pages.dev` とし、末尾の `/` は付けない。
9. この変更を `main` にマージする。手動実行するワークフローはデフォルトブランチに存在する必要がある。

Pages のプロジェクト作成には、管理者の環境で次のコマンドを使えます。
これは Cloudflare にリソースを作成する操作です。CI トークンとは別に認証してください。

```bash
bunx wrangler pages project create gakumas-produce-memory-deck-staging --production-branch=main
```

Pages 上の「Production」は、この staging 専用プロジェクトの固定 URL を指します。
アプリの本番環境ではありません。`--branch=main` を明示し、Preview の URL ではなく固定 URL を更新します。

Workers の単一 Worker 向け Editor トークンは Pages に流用できません。
Pages のトークンに同等のプロジェクト単位の制限があるとは仮定しません。
トークンの権限は、同じアカウント内の別プロジェクトにも及ぶ可能性があります。
本番と厳密に権限を分離する場合は、staging 用の Cloudflare アカウントを分けてください。
独自ドメイン・Workers Scripts・Routes・D1・R2 の権限は不要です。

プロジェクト名と URL は誤配信を防ぐため固定しています。
名前を変更する場合は、次の箇所を合わせて更新し、URL 検証のテストも修正してください。

- `wrangler.jsonc` の `name`
- `package.json` と `.github/workflows/deploy-staging.yml` の `--project-name`
- `scripts/validate-staging-release.sh` の許可 URL
- GitHub Environment の `STAGING_URL`

## 手動実行

1. GitHub の Actions → Deploy staging → Run workflow を開く。
2. ブランチは `main` を選ぶ。他のブランチではデプロイしない。
3. `version` に `v0.1.0-beta.1` のような未使用の beta タグを入力する。
4. ワークフローを実行し、承認ルールを設定している場合は Environment のデプロイを承認する。
5. 完了後、実行サマリーの URL と GitHub Releases を確認する。

処理の順序は次のとおりです。

1. バージョン、固定の Pages 公開先 URL、既存タグとコミットの一致を検査する。
2. 固定された Bun と lockfile で依存関係をインストールする。
3. 型検査、単体テスト、マスター検証、ビルド、整形検査、ローカル E2E テストを実行する。
4. `bun run build:staging` で再ビルドし、`deployment.json` と staging 専用の `_headers` を生成する。
5. `bun run verify:staging:local` で Pages ローカルランタイムのスモークテストを実行する。
6. 検証済みの `dist/` を `wrangler pages deploy` で再ビルドせず公開する。Cloudflare 認証情報はこのステップにだけ渡す。
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
BETA_TAG=v0.1.0-beta.1 bun run check:staging
```

`check:staging` はビルドと Pages ローカル検証のみで、Cloudflare に公開しません。
Pages の deploy コマンドには `--dry-run` がないため、旧 `deploy:staging:dry-run` は廃止しました。
ローカル検証はリモートの認証権限やプロジェクト設定まで保証するものではありません。

Playwright が `wrangler pages dev dist` を `127.0.0.1:4180` で起動・終了します。
既存サーバーを使い回さず、binding も設定しません。
検証では、公開先と同じコミット・画像・SPA ルーティング・`noindex`・`no-store` ヘッダーを確認します。
Pages の自動 SPA フォールバックを使うため、`dist/404.html` がある場合は staging ビルドを失敗させます。

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
STAGING_URL=https://gakumas-produce-memory-deck-staging.pages.dev \
EXPECTED_COMMIT=<デプロイしたコミットの完全なSHA> \
BETA_TAG=v0.1.0-beta.1 \
bun run test:staging
```

## Workers からの切り替え

1. 旧 Workers サイトのデータを JSON にエクスポートする。ホスト名変更により IndexedDB は別領域になる。
2. staging 専用 Pages プロジェクトを作成し、GitHub の API トークンと `STAGING_URL` を更新する。
3. 新しい beta バージョンで Actions を実行し、Pages の画面と Pre-release を確認する。
4. 新サイトで JSON をインポートし、登録内容を確認する。
5. 動作確認後、旧 Worker を管理者が停止・削除する。専用だった旧トークンも失効させる。

この変更は旧 Worker を自動で停止・削除しません。
過去の workflow run を再実行すると、旧 Workers 向けコードが実行されます。移行後は新しい workflow run を開始してください。

## 公開範囲とデータ

- staging は公開 URL です。`noindex` ヘッダーは認証やアクセス制限にはなりません。
- 限定公開が必要なら Cloudflare Access などを検討し、Pages の固定 URL への適用可否とテスト用認証を確認してください。
- ブラウザ内の IndexedDB はオリジンごとに分離されます。staging と本番のデータ移行には JSON を使います。
- 動作確認で登録するデータは、テスト専用ブラウザの IndexedDB に保存されます。
- 画像を独立して運用する必要が生じたら R2 を検討します。D1 は画像ファイルの保存先にしません。
- 画像を公開する前に、利用・再配布の条件を確認してください。

## 参考

- [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Pages roles](https://developers.cloudflare.com/workers/authorization/workers/#cloudflare-pages)
- [GitHub CLI release create](https://cli.github.com/manual/gh_release_create)
