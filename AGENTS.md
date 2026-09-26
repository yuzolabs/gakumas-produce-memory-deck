# Agent Instructions

## Commit

Don't use `git commit --no-verify`.

## Commit Message

Commit messages must be written in **Japanese** and follow the Conventional Commits.

Format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

- `type`: one of `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`
- `scope`: optional, a noun describing the affected area of the codebase
- `description`: a short summary of the change in Japanese, ending with a noun or a dictionary-form verb (e.g. 「機能を追加」, not 「機能を追加した」)
- `body`: optional, explain *what* and *why* (not *how*), wrap at ~72 characters
- `footer`: optional, e.g. `BREAKING CHANGE: <description>` (keep the `BREAKING CHANGE` token in English, write the description in Japanese) to note breaking changes, or `Closes #123` for issue references

Examples:

```
feat(api): ユーザーデータをエクスポートするエンドポイントを追加
```

```
fix: 空入力時のクラッシュを防止

Closes #42
```

```
refactor(parser)!: `parseTokens` を `lex` にリネーム

BREAKING CHANGE: 公開関数 `parseTokens` は `lex` に変更された。
```
