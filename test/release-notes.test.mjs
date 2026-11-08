import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'scripts', 'release-notes.mjs');
const CHANGELOG_ZH = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n- 第一版\n';
const CHANGELOG_EN = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n- First release\n';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-notes-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@tlewa/demo', version: '1.0.0' }));
  writeFileSync(join(dir, 'CHANGELOG.md'), CHANGELOG_ZH);
  writeFileSync(join(dir, 'CHANGELOG.en.md'), CHANGELOG_EN);
  return dir;
}

test('writes both language sections for the current version', () => {
  const dir = fixture();
  const r = spawnSync(process.execPath, [SCRIPT, '--out', 'notes.md'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const body = readFileSync(join(dir, 'notes.md'), 'utf8');
  assert.match(body, /## 中文/);
  assert.match(body, /## English/);
  assert.match(body, /第一版/);
  assert.match(body, /First release/);
  assert.ok(body.indexOf('[Unreleased]') < 0);
});

test('fails when one language is missing the version section', () => {
  const dir = fixture();
  writeFileSync(join(dir, 'CHANGELOG.en.md'), '# Changelog\n\n## [Unreleased]\n');
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /CHANGELOG 缺少 1\.0\.0/);
});
