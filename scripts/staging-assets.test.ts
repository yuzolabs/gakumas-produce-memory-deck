import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStagingDeployment, writeStagingAssets } from './staging-assets';

const commit = 'a'.repeat(40);
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'staging-assets-'));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('local staging credential exclusions', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.staging',
    '.dev.vars',
    '.dev.vars.staging',
    'nested/.env.local',
  ])('ignores %s', (path) =>
    expect(spawnSync('git', ['check-ignore', '--no-index', '--quiet', path]).status).toBe(0),
  );
  it.each([
    '.env.example',
    '.env.staging.example',
    '.dev.vars.example',
    '.dev.vars.staging.example',
  ])('allows the example template %s', (path) =>
    expect(spawnSync('git', ['check-ignore', '--no-index', '--quiet', path]).status).toBe(1),
  );
});

describe('staging deployment metadata', () => {
  it('accepts a full SHA and beta tag', () => {
    expect(createStagingDeployment(commit, 'v0.1.0-beta.1')).toEqual({
      commit,
      version: 'v0.1.0-beta.1',
    });
  });
  it.each([undefined, '', 'v0.1.0', 'v01.0.0-beta.1', 'v0.1.0-beta.01', 'v0.1.0-beta.1\n'])(
    'rejects invalid beta tag %s',
    (version) => {
      expect(() => createStagingDeployment(commit, version)).toThrow(
        'Staging build requires BETA_TAG',
      );
    },
  );
  it.each(['', 'abc123', 'g'.repeat(40), `${commit}\n`])('rejects invalid commit %s', (sha) => {
    expect(() => createStagingDeployment(sha, 'v0.1.0-beta.1')).toThrow(
      'Staging build requires a full',
    );
  });
  it('writes the same metadata and headers for local and CI builds', () => {
    writeFileSync(join(directory, 'index.html'), '<!doctype html>');
    const deployment = createStagingDeployment(commit, 'v0.1.0-beta.1');
    writeStagingAssets(directory, deployment);
    expect(JSON.parse(readFileSync(join(directory, 'deployment.json'), 'utf8'))).toEqual(
      deployment,
    );
    expect(readFileSync(join(directory, '_headers'), 'utf8')).toBe(
      '/*\n  X-Robots-Tag: noindex, nofollow\n/deployment.json\n  Cache-Control: no-store\n',
    );
    writeStagingAssets(directory, createStagingDeployment('b'.repeat(40), 'v0.1.0-beta.2'));
    expect(JSON.parse(readFileSync(join(directory, 'deployment.json'), 'utf8')).version).toBe(
      'v0.1.0-beta.2',
    );
  });
  it('refuses to generate metadata without a built site', () => {
    expect(() =>
      writeStagingAssets(directory, createStagingDeployment(commit, 'v0.1.0-beta.1')),
    ).toThrow();
  });
});
