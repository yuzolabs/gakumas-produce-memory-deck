import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const localStaging = process.env.STAGING_LOCAL === '1';
const localStagingUrl = 'http://127.0.0.1:4180';
const stagingUrl = localStaging ? localStagingUrl : process.env.STAGING_URL;
if (localStaging && !process.env.EXPECTED_COMMIT) {
  process.env.EXPECTED_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}
if (!stagingUrl || !process.env.EXPECTED_COMMIT || !process.env.BETA_TAG) {
  throw new Error('Staging smoke test requires STAGING_URL, EXPECTED_COMMIT and BETA_TAG');
}

export default defineConfig({
  testDir: './tests/staging',
  workers: 1,
  timeout: 90_000,
  retries: localStaging ? 0 : 2,
  webServer: localStaging
    ? {
        command: 'bunx wrangler pages dev dist --ip 127.0.0.1 --port 4180 --inspector-port 0',
        url: `${localStagingUrl}/deployment.json`,
        reuseExistingServer: false,
        timeout: 60_000,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      }
    : undefined,
  use: {
    baseURL: stagingUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'staging-chromium', use: { ...devices['Desktop Chrome'] } }],
});
