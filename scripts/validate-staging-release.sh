#!/usr/bin/env bash
set -euo pipefail

if [[ ! "${BETA_TAG:-}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-beta\.(0|[1-9][0-9]*)$ ]]; then
  echo 'Staging release validation failed: use a tag such as v0.1.0-beta.1' >&2
  exit 1
fi

# Use the fixed staging Pages project, not a preview alias or production project.
if [[ "${STAGING_URL:-}" != 'https://gakumas-produce-memory-deck-staging.pages.dev' ]]; then
  echo 'Staging release validation failed: STAGING_URL must be https://gakumas-produce-memory-deck-staging.pages.dev without a trailing slash' >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/tags/$BETA_TAG"; then
  if [[ "$(git rev-parse "refs/tags/$BETA_TAG^{commit}")" != "$GITHUB_SHA" ]]; then
    echo 'Staging release validation failed: beta tag already points to a different commit' >&2
    exit 1
  fi
fi
