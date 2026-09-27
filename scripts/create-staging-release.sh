#!/usr/bin/env bash
set -euo pipefail

# Recheck tags after checkout: a release-only retry must never move an existing tag.
bash scripts/validate-staging-release.sh

# Listing via the API distinguishes a missing release (404) from authentication/server errors.
response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT
if gh api --include "repos/$GH_REPO/releases/tags/$BETA_TAG" > "$response_file"; then
  release_json=$(awk 'body { print } /^\r?$/ { body=1 }' "$response_file")
  if ! git show-ref --verify --quiet "refs/tags/$BETA_TAG" ||
    ! jq -e '.prerelease == true and .draft == false' <<< "$release_json" > /dev/null; then
    echo 'Staging release creation failed: existing release is not a published prerelease' >&2
    exit 1
  fi
  echo 'Staging beta prerelease already exists for this commit; leaving it unchanged.'
  exit 0
elif ! awk 'NR == 1 { missing = ($2 == 404) } END { exit (missing ? 0 : 1) }' "$response_file"; then
  exit 1
fi

notes=$(printf 'Staging: %s\n\nCommit: %s\n\nDeployment workflow: %s\n\nThis staging URL is updated by subsequent deployments. Browser data is separate from production.' \
  "$STAGING_URL" "$GITHUB_SHA" "$STAGING_RUN_URL")
gh release create "$BETA_TAG" \
  --target "$GITHUB_SHA" \
  --prerelease \
  --latest=false \
  --title "$BETA_TAG" \
  --notes "$notes"
