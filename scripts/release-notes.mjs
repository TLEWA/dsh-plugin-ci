#!/usr/bin/env node
/**
 * release-notes.mjs - build the GitHub Release body from both CHANGELOG files.
 *
 *   node scripts/release-notes.mjs --out .release-notes.md
 *   node scripts/release-notes.mjs --version 1.0.0
 */
import { readFileSync, writeFileSync } from 'node:fs';

function flag(name) {
  const hit = process.argv.find((a) => a === name || a.indexOf(name + '=') === 0);
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : '';
}
function section(file, version) {
  if (!file) return '';
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.indexOf(version) >= 0);
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = flag('--version') || pkg.version;
const zh = section('CHANGELOG.md', version);
const en = section('CHANGELOG.en.md', version);
if (!zh || !en) {
  console.error('CHANGELOG 缺少 ' + version + ' 小节（中英文都必须写）');
  process.exit(1);
}
const out = flag('--out') || '.release-notes.md';
const body = '## 中文\n\n' + zh + '\n\n---\n\n## English\n\n' + en + '\n';
writeFileSync(out, body);
console.log('wrote ' + out + ' for ' + pkg.name + '@' + version);
