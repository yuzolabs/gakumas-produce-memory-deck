import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Validates the commit and beta tag embedded in staging deployment metadata. */
export function createStagingDeployment(commit: string, version: string | undefined) {
  if (commit.length !== 40 || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('Staging build requires a full 40-character commit SHA');
  }
  if (
    !version ||
    version !== version.trim() ||
    !/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-beta\.(0|[1-9][0-9]*)$/.test(version)
  ) {
    throw new Error('Staging build requires BETA_TAG such as v0.1.0-beta.1');
  }
  return { commit, version };
}

/** Adds staging-only headers and deployment metadata to an existing Vite build. */
export function writeStagingAssets(
  assetDirectory: string,
  deployment: ReturnType<typeof createStagingDeployment>,
) {
  // Fail if the build did not produce an entry point; never create a metadata-only dist.
  readFileSync(join(assetDirectory, 'index.html'));
  writeFileSync(
    join(assetDirectory, 'deployment.json'),
    `${JSON.stringify(deployment, null, 2)}\n`,
  );
  writeFileSync(
    join(assetDirectory, '_headers'),
    '/*\n  X-Robots-Tag: noindex, nofollow\n/deployment.json\n  Cache-Control: no-store\n',
  );
}
