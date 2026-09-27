import { execFileSync } from 'node:child_process';
import { createStagingDeployment, writeStagingAssets } from './staging-assets';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (process.env.EXPECTED_COMMIT && process.env.EXPECTED_COMMIT !== commit) {
  throw new Error('Staging build commit does not match EXPECTED_COMMIT');
}
const deployment = createStagingDeployment(commit, process.env.BETA_TAG);

// Vite clears dist, so stale files from a previous staging build cannot be deployed.
execFileSync('bun', ['run', 'build'], { stdio: 'inherit' });
writeStagingAssets('dist', deployment);
