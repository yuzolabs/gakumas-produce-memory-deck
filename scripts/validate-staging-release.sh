#!/usr/bin/env bash
set -euo pipefail

if [[ ! "${BETA_TAG:-}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-beta\.(0|[1-9][0-9]*)$ ]]; then
  echo 'Staging release validation failed: use a tag such as v0.1.0-beta.1' >&2
  exit 1
fi

# This workflow deploys only the fixed staging Worker, never a production hostname.
if [[ ! "${STAGING_URL:-}" =~ ^https://gakumas-produce-memory-deck-staging\.[a-z0-9-]+\.workers\.dev$ ]]; then
  echo 'Staging release validation failed: STAGING_URL must be the staging workers.dev origin without a trailing slash' >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/tags/$BETA_TAG"; then
  if [[ "$(git rev-parse "refs/tags/$BETA_TAG^{commit}")" != "$GITHUB_SHA" ]]; then
    echo 'Staging release validation failed: beta tag already points to a different commit' >&2
    exit 1
  fi
fi
