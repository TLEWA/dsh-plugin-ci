import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'init-repo.mjs');

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ci-init-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.0.0' }, null, 2) + '\n');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  return dir;
}

function run(dir, args = []) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function releaseWorkflow(dir) {
  return readFileSync(join(dir, '.github', 'workflows', 'release.yml'), 'utf8');
}

test('init writes an OIDC release caller by default', () => {
  const dir = fixture();
  try {
    run(dir);
    const text = releaseWorkflow(dir);
    assert.match(text, /uses: TLEWA\/dsh-plugin-ci\/\.github\/workflows\/reusable-release\.yml@v1/);
    assert.match(text, /secrets: inherit/);
    assert.doesNotMatch(text, /use-token/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init writes the label rerun workflow next to the ci caller', () => {
  const dir = fixture();
  try {
    run(dir);
    const text = readFileSync(join(dir, '.github', 'workflows', 'ci-rerun.yml'), 'utf8');
    assert.match(text, /types: \[labeled, unlabeled, edited\]/);
    assert.match(text, /actions:\s*write/);
    assert.match(text, /select\(\.name == "pr-guard"\)/);
    const ci = readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8');
    assert.doesNotMatch(ci, /labeled/);
    assert.doesNotMatch(ci, /reopened/);
    const guard = readFileSync(join(dir, '.github', 'workflows', 'pr-guard.yml'), 'utf8');
    assert.match(guard, /uses: TLEWA\/dsh-plugin-ci\/\.github\/workflows\/reusable-pr-guard\.yml@v1/);
    assert.doesNotMatch(guard, /types:\s*\[[^\]]*\blabeled\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--npm-token adds with.use-token and is idempotent', () => {
  const dir = fixture();
  try {
    run(dir, ['--npm-token']);
    const text = releaseWorkflow(dir);
    assert.match(text, /uses: TLEWA\/dsh-plugin-ci\/\.github\/workflows\/reusable-release\.yml@v1\n    with:\n      use-token: true\n    secrets: inherit/);

    run(dir, ['--npm-token']);
    const again = releaseWorkflow(dir);
    assert.equal((again.match(/use-token:/g) || []).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init keeps an existing legacy ci caller and does not add a half-migrated guard', () => {
  const dir = fixture();
  try {
    const workflows = join(dir, '.github', 'workflows');
    mkdirSync(workflows, { recursive: true });
    writeFileSync(join(workflows, 'ci.yml'), [
      'name: ci',
      'on:',
      '  pull_request:',
      '    types: [opened, synchronize, reopened, ready_for_review]',
      '  push:',
      'jobs:',
      '  ci:',
      '    uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1',
      '',
    ].join('\n'));
    run(dir);
    assert.ok(!existsSync(join(workflows, 'pr-guard.yml')), 'a legacy ci caller must not gain a guard that the gate would treat as half-migrated');
    assert.doesNotMatch(readFileSync(join(workflows, 'ci.yml'), 'utf8'), /separate-guard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--npm-token patches an existing caller that has no with block', () => {
  const dir = fixture();
  try {
    const workflows = join(dir, '.github', 'workflows');
    mkdirSync(workflows, { recursive: true });
    writeFileSync(join(workflows, 'release.yml'), [
      'name: release',
      'on:',
      '  push:',
      "    tags: ['v*.*.*']",
      'jobs:',
      '  release:',
      '    uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-release.yml@v1',
      '    secrets: inherit',
      '',
    ].join('\n'));

    run(dir, ['--npm-token']);
    const text = releaseWorkflow(dir);
    assert.match(text, /uses: TLEWA\/dsh-plugin-ci\/\.github\/workflows\/reusable-release\.yml@v1\n    with:\n      use-token: true\n    secrets: inherit/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
