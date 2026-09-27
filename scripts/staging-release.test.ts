import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptPath = resolve('scripts/validate-staging-release.sh');
let directory: string;
let commit: string;

function runGit(...args: string[]) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Staging test git failed: ${result.stderr}`);
  return result.stdout.trim();
}

function validateStagingRelease(overrides: Record<string, string> = {}) {
  return spawnSync('bash', ['scripts/validate-staging-release.sh'], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      BETA_TAG: 'v0.1.0-beta.1',
      STAGING_URL: 'https://gakumas-produce-memory-deck-staging.pages.dev',
      GITHUB_SHA: commit,
      ...overrides,
    },
  });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'staging-release-'));
  mkdirSync(join(directory, 'scripts'));
  cpSync(scriptPath, join(directory, 'scripts/validate-staging-release.sh'));
  runGit('init', '--quiet');
  runGit(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  );
  commit = runGit('rev-parse', 'HEAD');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('staging release validation', () => {
  it('accepts a new beta tag', () => expect(validateStagingRelease().status).toBe(0));
  it.each(['v1.0.0', 'v01.0.0-beta.1', 'v1.0.0-beta.01', 'v1.0.0-beta.1\necho unsafe', '$(id)'])(
    'rejects invalid tag %s',
    (tag) => expect(validateStagingRelease({ BETA_TAG: tag }).status).not.toBe(0),
  );
  it.each([
    '',
    'https://production.example.com',
    'https://gakumas-produce-memory-deck-staging.example.workers.dev',
    'http://gakumas-produce-memory-deck-staging.pages.dev',
    'https://gakumas-produce-memory-deck-staging.pages.dev/',
    'https://gakumas-produce-memory-deck.pages.dev',
    'https://preview.gakumas-produce-memory-deck-staging.pages.dev',
    'https://gakumas-produce-memory-deck-staging.pages.dev.evil.example',
    'https://gakumas-produce-memory-deck-staging.pages.dev\n',
  ])('rejects invalid staging URL %s', (url) =>
    expect(validateStagingRelease({ STAGING_URL: url }).status).not.toBe(0),
  );
  it('allows a retry of the same commit but rejects a conflicting tag', () => {
    runGit('tag', 'v0.1.0-beta.1');
    expect(validateStagingRelease().status).toBe(0);
    expect(validateStagingRelease({ GITHUB_SHA: 'different' }).status).not.toBe(0);
  });
});
