#!/usr/bin/env node
/**
 * sync-ci.mjs - copy the canonical ci-gate.mjs into this repository.
 *
 *   node scripts/sync-ci.mjs            # sync (writes gate + stamp)
 *   node scripts/sync-ci.mjs --check    # fail if the local gate drifted
 *   node scripts/sync-ci.mjs --from=../dsh-plugin-ci/scripts/ci-gate.mjs
 *
 * Source resolution: --from > CI_GATE_SOURCE > GitHub raw main.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const GATE = 'scripts/ci-gate.mjs';
const STAMP = 'scripts/ci-process.json';
const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/TLEWA/dsh-plugin-ci/main/scripts/ci-gate.mjs';

function flag(name) {
  const hit = process.argv.find((a) => a === name || a.indexOf(name + '=') === 0);
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : '';
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
const source = flag('--from') || process.env.CI_GATE_SOURCE || DEFAULT_SOURCE;

async function readSource() {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, {
      headers: { 'user-agent': 'dsh-plugin-ci-sync' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error('下载 canonical gate 失败: HTTP ' + res.status + ' ' + source);
    return await res.text();
  }
  if (!existsSync(source)) throw new Error('找不到 canonical gate: ' + source);
  return readFileSync(source, 'utf8');
}

const remote = await readSource();
const remoteSha = sha(remote);
const local = existsSync(GATE) ? readFileSync(GATE, 'utf8') : '';
const localSha = local ? sha(local) : '(missing)';

if (flag('--check') !== null) {
  const stamp = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : null;
  const problems = [];
  if (localSha !== remoteSha) problems.push('scripts/ci-gate.mjs 与 canonical 不一致 (' + localSha.slice(0, 12) + ' != ' + remoteSha.slice(0, 12) + ')');
  if (!stamp) problems.push('缺少 scripts/ci-process.json');
  else {
    if (stamp.sha256 !== localSha) problems.push('过程戳记录的 sha256 与本地 gate 不一致');
    if (!('gateVersion' in stamp)) problems.push('过程戳缺少 gateVersion');
  }
  if (problems.length === 0) {
    console.log('OK gate 与 canonical 一致 (' + remoteSha.slice(0, 12) + ')');
    process.exit(0);
  }
  console.error('DRIFT ' + problems.join('; '));
  const repo = process.env.GITHUB_REPOSITORY;
  if (flag('--issue') !== null && process.env.GH_TOKEN && repo) {
    const title = '[drift] ci-gate.mjs 与 canonical 不一致';
    const body = '检测到 gate 漂移：\n\n- ' + problems.join('\n- ') + '\n\n修复：node scripts/sync-ci.mjs 并提交。\n';
    try {
      execFileSync('gh', ['issue', 'create', '--repo', repo, '--title', title, '--body', body], { stdio: 'inherit' });
    } catch (e) {
      console.error('创建 issue 失败: ' + e.message);
    }
  }
  process.exit(1);
}

mkdirSync(dirname(GATE), { recursive: true });
writeFileSync(GATE, remote);
writeFileSync(STAMP, JSON.stringify({
  gateVersion: 1,
  sha256: remoteSha,
  source,
  syncedAt: new Date().toISOString(),
}, null, 2) + '\n');
console.log('synced ' + GATE + ' (' + remoteSha.slice(0, 12) + ')');
