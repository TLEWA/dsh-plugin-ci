#!/usr/bin/env node
/**
 * check-drift.mjs - compare the reusable workflow pin in this repository with
 * the latest release of the canonical repository.
 *
 *   node .ci/scripts/check-drift.mjs
 *   node .ci/scripts/check-drift.mjs --issue   # open/reuse a tracking issue
 *
 * Exit code 1 when the repository pins an older major than the canonical one.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CANONICAL = 'TLEWA/dsh-plugin-ci';
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/pr-guard.yml', '.github/workflows/drift.yml', '.github/workflows/release.yml'];
const PIN_RE = new RegExp(CANONICAL.replace(/[./]/g, '\\$&') + '/\\.github/workflows/[a-z-]+\\.yml@v(\\d+)', 'g');

function read(p) {
  try { return readFileSync(p, 'utf8'); } catch (e) { return ''; }
}
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}
async function latestTag() {
  try {
    const raw = gh(['api', 'repos/' + CANONICAL + '/releases/latest', '--jq', '.tag_name']);
    if (raw) return raw;
  } catch (e) { /* fall through to the anonymous API */ }
  const res = await fetch('https://api.github.com/repos/' + CANONICAL + '/releases/latest', {
    headers: { 'user-agent': 'dsh-plugin-ci', accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('无法读取 ' + CANONICAL + ' 的最新 release（HTTP ' + res.status + '）');
  return String((await res.json()).tag_name || '');
}
function majorOf(tag) {
  const m = String(tag).match(/^v?(\d+)/);
  return m ? Number(m[1]) : null;
}

const pins = [];
for (const file of WORKFLOWS) {
  const text = read(file);
  if (!text) continue;
  let m;
  PIN_RE.lastIndex = 0;
  while ((m = PIN_RE.exec(text)) !== null) pins.push({ file, major: Number(m[1]) });
}
if (pins.length === 0) {
  console.error('没有找到对 ' + CANONICAL + ' reusable workflow 的调用（@v<major>）');
  process.exit(1);
}
const latest = await latestTag();
const latestMajor = majorOf(latest);
const stale = pins.filter((p) => latestMajor !== null && p.major < latestMajor);
const report = [
  'canonical: ' + CANONICAL + '  latest release: ' + latest,
  ...pins.map((p) => p.file + ': @v' + p.major),
].join('\n');
console.log(report);
if (stale.length === 0) {
  console.log('pins are up to date');
  process.exit(0);
}

const title = '[ci] policy drift: update the reusable workflow pin';
const body = [
  'The reusable workflow pin in this repository is older than the canonical release.',
  '',
  '~~~',
  report,
  '~~~',
  '',
  'Update every uses: ' + CANONICAL + '/.github/workflows/*@v<major> reference to @v' + latestMajor + ',',
  'run the gate locally, and open a PR. The full contract is in the canonical PROCESS.md.',
].join('\n');
console.log('DRIFT: pinned major is older than v' + latestMajor);
if (process.argv.includes('--issue')) {
  let existing = '';
  try {
    existing = gh(['issue', 'list', '--state', 'open', '--search', 'policy drift in:title', '--json', 'number', '--jq', '.[0].number // empty']);
  } catch (e) { existing = ''; }
  if (existing) {
    gh(['issue', 'comment', existing, '--body', body]);
    console.log('commented on issue #' + existing);
  } else {
    const url = gh(['issue', 'create', '--title', title, '--body', body]);
    console.log('opened ' + url);
  }
}
process.exit(1);
