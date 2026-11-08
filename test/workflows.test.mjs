import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const REUSABLE = [
  '.github/workflows/reusable-ci.yml',
  '.github/workflows/reusable-release.yml',
  '.github/workflows/reusable-drift.yml',
];
const CALLERS = [
  'templates/workflows/ci.yml',
  'templates/workflows/release.yml',
  'templates/workflows/drift.yml',
];
const REMOTE = 'TLEWA/dsh-plugin-ci/.github/workflows/';

test('every reusable workflow is callable and pins only static actions', () => {
  for (const file of REUSABLE) {
    const text = read(file);
    assert.match(text, /^on:/m, file + ' needs an on: trigger');
    assert.match(text, /workflow_call:/, file + ' must be reusable');
    for (const line of text.split(/\r?\n/)) {
      if (!/^\s*uses:/.test(line)) continue;
      assert.ok(line.indexOf('${{') < 0, file + ' has a dynamic uses: ' + line.trim());
    }
  }
});

test('the reusable CI workflow checks out the canonical gate and aggregates ci-ok', () => {
  const text = read('.github/workflows/reusable-ci.yml');
  assert.match(text, /repository: \$\{\{ job\.workflow_repository \|\| github\.repository \}\}/);
  assert.match(text, /ref: \$\{\{ job\.workflow_sha \|\| github\.sha \}\}/);
  assert.equal((text.match(/job\.workflow_repository \|\| github\.repository/g) || []).length, 2, 'both CI checkouts need a same-repo fallback');
  assert.match(text, /path: \.ci/);
  assert.match(text, /node \.ci\/scripts\/ci-gate\.mjs/);
  assert.match(text, /fromJSON\(inputs\.matrix\)/);
  assert.match(text, /matrix:\n\s+include: \$\{\{ fromJSON\(inputs\.matrix\) \}\}/);
  for (const job of ['pr-guard:', 'verify:', 'ci-ok:']) assert.ok(text.indexOf(job) >= 0, 'missing job ' + job);
  assert.match(text, /needs: \[pr-guard, verify\]/);
});

test('the default matrix covers both operating systems and all supported Node lines', () => {
  const text = read('.github/workflows/reusable-ci.yml');
  const m = text.match(/default: '([^']+)'/);
  assert.ok(m, 'missing matrix default');
  const matrix = JSON.parse(m[1]);
  assert.equal(matrix.length, 6);
  assert.deepEqual([...new Set(matrix.map((x) => x.os))].sort(), ['ubuntu-latest', 'windows-latest']);
  assert.deepEqual([...new Set(matrix.map((x) => x.node))].sort((a, b) => a - b), [20, 22, 24]);
});

test('the reusable release workflow uses trusted publishing and the npm version that supports it', () => {
  const text = read('.github/workflows/reusable-release.yml');
  assert.match(text, /id-token: write/);
  assert.match(text, /npm install -g npm@11\.21\.0/);
  assert.match(text, /npm publish --provenance --access public/);
  assert.match(text, /--after-publish/);
  assert.match(text, /release-notes\.mjs/);
  assert.match(text, /Read the release configuration/);
  assert.match(text, /steps\.config\.outputs\.publish == 'true'/);
  assert.match(text, /steps\.config\.outputs\.publish == 'true' && !inputs\.use-token/);
  assert.match(text, /inputs\.use-token/);
  assert.match(text, /NPM_TOKEN/);
  assert.ok(!/registry-url:/.test(text), 'trusted publishing must not rely on a token placeholder in .npmrc');
  assert.match(text, /_authToken=\$NODE_AUTH_TOKEN/);
  assert.match(text, /NPM_TOKEN is empty/);
  for (const file of ['.github/workflows/reusable-ci.yml', '.github/workflows/reusable-release.yml', '.github/workflows/reusable-drift.yml']) {
    const body = read(file);
    assert.match(body, /repository: \$\{\{ job\.workflow_repository \|\| github\.repository \}\}/, file + ' needs a repository fallback');
    assert.match(body, /ref: \$\{\{ job\.workflow_sha \|\| github\.sha \}\}/, file + ' needs a ref fallback');
  }
});

test('external callers pin the canonical reusable workflows at a major tag', () => {
  for (const file of CALLERS) {
    const text = read(file);
    assert.match(text, new RegExp('uses: ' + REMOTE.replace(/[./]/g, '\\$&') + 'reusable-[a-z]+\\.yml@v\\d+'), file + ' must pin @v<major>');
  }
  const ci = read('templates/workflows/ci.yml');
  assert.match(ci, /^  ci:$/m);
  const release = read('templates/workflows/release.yml');
  assert.match(release, /secrets: inherit/);
  assert.ok(release.includes("tags: ['v*.*.*']"), 'release must trigger on semver tags');
});

test('the canonical repository calls its own reusable workflows', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /uses: \.\/\.github\/workflows\/reusable-ci\.yml/);
  assert.ok(ci.indexOf(REMOTE) < 0, 'canonical CI must not call itself over the network');
  const release = read('.github/workflows/release.yml');
  assert.match(release, /uses: \.\/\.github\/workflows\/reusable-release\.yml/);
  assert.ok(release.indexOf(REMOTE) < 0, 'canonical release must not call itself over the network');
});

test('the canonical release keeps npm publishing behind release.publish and uploads assets', () => {
  const text = read('.github/workflows/release.yml');
  assert.ok(text.indexOf('npm publish') < 0, 'canonical caller must delegate publishing to the reusable workflow');
  assert.match(text, /contents: write/);
  assert.match(text, /id-token: write/);
  const reusable = read('.github/workflows/reusable-release.yml');
  assert.match(reusable, /steps\.config\.outputs\.publish == 'true'/);
  assert.match(reusable, /gh release create/);
  assert.match(reusable, /SHA256SUMS/);
});
