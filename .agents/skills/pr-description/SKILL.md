---
name: pr-description
description: >-
  Generate a pull request description file (pr.md) based on the git diff since
  the branch diverged from the base branch, following the project's PR template
  at .github/copilot-pull-request-instructions.md. Use when the user asks to
  "write a PR description", "create PR description", "PRの説明文を書いて",
  "PR descriptionを作って", or any similar request to document what changes were
  made in this branch.
---

# PR Description

Generate `pr.md` from the current branch's git diff, following the project PR template.

## Workflow

### Step 1: Determine base branch

```bash
# Find the base branch (usually main or master)
git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null | sed 's|origin/||'
# If that fails, try:
git remote show origin | grep 'HEAD branch' | awk '{print $NF}'
```

### Step 2: Get diff since branch diverged

```bash
# Get the merge-base commit (where this branch diverged from base)
BASE=$(git merge-base HEAD origin/main)   # replace "main" with actual base branch

# Full diff of all changed files
git diff $BASE HEAD

# Summary of changed files
git diff $BASE HEAD --stat

# List of commits on this branch
git log $BASE..HEAD --oneline
```

### Step 3: Read the PR template

Read `.github/copilot-pull-request-instructions.md` to get the required template format.

### Step 4: Write pr.md

Using the diff, commit log, and template, generate `pr.md` in the project root.

**Template structure** (from `.github/copilot-pull-request-instructions.md`):

```markdown
<!-- PRタイトル -->
## 概要
<!-- このPRの背景・目的・概要 -->

## 変更内容
<!-- このPRで実施した変更内容 -->

## 補足
<!-- レビュワーへの情報、残しておきたいメモ、参考リンク -->
```

- The **first line** must be the PR title (concise, in Japanese).
- **概要**: Explain the background and purpose — *why* this PR exists.
- **変更内容**: Concrete list of what was modified/added/removed — *what* was done.
- **補足**: Anything relevant for reviewers (e.g., design decisions, caveats, links to issues).

### Step 5: Validate pr.md

The pr.md output is written in Japanese, so always run markdown lint:

```bash
bunx markdownlint-cli2 --fix "pr.md"
```

## Rules

- Output language: **Japanese** (write the title, headings, and body all in Japanese).
- Do NOT include any diff output, raw git content, or code snippets in pr.md unless they aid understanding.
- Keep the PR title on the first line, not inside a heading.
- If the base branch cannot be determined automatically, assume `main`.
- If `.github/copilot-pull-request-instructions.md` does not exist, use the template structure above as the default.
