import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptDirectory = resolve('scripts');
let directory: string;
let commit: string;

function runGit(...args: string[]) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Staging test git failed: ${result.stderr}`);
  return result.stdout.trim();
}

function runScript(script: string, overrides: Record<string, string> = {}) {
  return spawnSync('bash', [`scripts/${script}.sh`], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}/bin:${process.env.PATH}`,
      BETA_TAG: 'v0.1.0-beta.1',
      STAGING_URL: 'https://gakumas-produce-memory-deck-staging.pages.dev',
      GITHUB_SHA: commit,
      GH_REPO: 'example/repository',
      STAGING_RUN_URL: 'https://github.com/example/repository/actions/runs/1',
      MOCK_STATUS: '404',
      MOCK_BODY: '{}',
      ...overrides,
    },
  });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'staging-release-'));
  mkdirSync(join(directory, 'scripts'));
  mkdirSync(join(directory, 'bin'));
  for (const script of ['validate-staging-release.sh', 'create-staging-release.sh']) {
    cpSync(join(scriptDirectory, script), join(directory, 'scripts', script));
  }
  writeFileSync(
    join(directory, 'bin/gh'),
    `#!/usr/bin/env bash
set -eu
if [[ "$1" == api ]]; then
  printf 'HTTP/2.0 %s Status\\r\\nContent-Type: application/json\\r\\n\\r\\n%s\\n' "$MOCK_STATUS" "$MOCK_BODY"
  [[ "$MOCK_STATUS" == 200 ]]
else
  printf '%s\\n' "$@" > release-args
fi
`,
    { mode: 0o755 },
  );
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
  it('accepts a new beta tag', () => {
    expect(runScript('validate-staging-release').status).toBe(0);
  });
  it.each(['v1.0.0', 'v01.0.0-beta.1', 'v1.0.0-beta.01', 'v1.0.0-beta.1\necho unsafe', '$(id)'])(
    'rejects invalid tag %s',
    (tag) => expect(runScript('validate-staging-release', { BETA_TAG: tag }).status).not.toBe(0),
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
    expect(runScript('validate-staging-release', { STAGING_URL: url }).status).not.toBe(0),
  );
  it('allows a retry of the same commit but rejects a conflicting tag', () => {
    runGit('tag', 'v0.1.0-beta.1');
    expect(runScript('validate-staging-release').status).toBe(0);
    expect(runScript('validate-staging-release', { GITHUB_SHA: 'different' }).status).not.toBe(0);
  });
});

describe('staging beta release creation', () => {
  it('creates a prerelease pointing at the deployed SHA, never Latest', () => {
    const result = runScript('create-staging-release');
    expect(result.status, result.stderr).toBe(0);
    const args = readFileSync(join(directory, 'release-args'), 'utf8');
    expect(args).toContain(`--target\n${commit}\n`);
    expect(args).toContain('--prerelease\n--latest=false\n');
  });
  it('leaves an existing published prerelease unchanged', () => {
    runGit('tag', 'v0.1.0-beta.1');
    const result = runScript('create-staging-release', {
      MOCK_STATUS: '200',
      MOCK_BODY: '{"prerelease":true,"draft":false}',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('already exists');
  });
  it.each(['401', '403', '500', ''])('does not create a release after API status %s', (status) => {
    expect(runScript('create-staging-release', { MOCK_STATUS: status }).status).not.toBe(0);
  });
  it('rejects an existing stable release', () => {
    runGit('tag', 'v0.1.0-beta.1');
    expect(
      runScript('create-staging-release', {
        MOCK_STATUS: '200',
        MOCK_BODY: '{"prerelease":false,"draft":false}',
      }).status,
    ).not.toBe(0);
  });
});
