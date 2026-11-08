#!/usr/bin/env node
/**
 * apply-rulesets.mjs - push rulesets/*.json to GitHub repositories.
 *
 *   node scripts/apply-rulesets.mjs --dry-run
 *   node scripts/apply-rulesets.mjs --repo=TLEWA/dsh-sidebar-row-menu
 *   node scripts/apply-rulesets.mjs --repos=TLEWA/a,TLEWA/b
 *   node scripts/apply-rulesets.mjs --repos=TLEWA/a,TLEWA/b --check
 *
 * --check only compares the local definitions with GitHub and exits 1 on drift.
 * Requires the gh CLI authenticated with admin rights. The JSON files are the
 * authority: do not edit rules in the UI.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

function flag(name) {
  const hit = process.argv.find((a) => a === name || a.indexOf(name + '=') === 0);
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : '';
}
function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input });
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

const dryRun = process.argv.includes('--dry-run');
const checkOnly = process.argv.includes('--check');
const list = flag('--repos') || flag('--repo');
const repos = list ? list.split(',').map((x) => x.trim()).filter(Boolean) : [];
if (repos.length === 0) {
  repos.push(process.env.GITHUB_REPOSITORY || gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim());
}
const files = readdirSync('rulesets').filter((f) => f.slice(-5) === '.json').sort();
if (files.length === 0) {
  console.error('rulesets/ 下没有 JSON 定义');
  process.exit(1);
}

let drift = false;
for (const repo of repos) {
  const existing = JSON.parse(gh(['api', 'repos/' + repo + '/rulesets']) || '[]');
  for (const file of files) {
    const spec = JSON.parse(readFileSync(join('rulesets', file), 'utf8'));
    const found = existing.find((r) => r.name === spec.name);
    if (checkOnly) {
      let live = null;
      if (found) live = JSON.parse(gh(['api', 'repos/' + repo + '/rulesets/' + found.id]));
      const keys = ['target', 'enforcement', 'conditions', 'rules', 'bypass_actors'];
      const same = live && keys.every((k) => stable(live[k]) === stable(spec[k]));
      console.log((same ? 'ok    ' : 'DRIFT ') + repo + '  ' + spec.name);
      if (!same) {
        drift = true;
        if (live) for (const k of keys) if (stable(live[k]) !== stable(spec[k])) console.log('       differs: ' + k);
      }
      continue;
    }
    const target = found ? 'PUT repos/' + repo + '/rulesets/' + found.id : 'POST repos/' + repo + '/rulesets';
    if (dryRun) {
      console.log('[dry-run] ' + target + '  ' + spec.name + '  (' + file + ')');
      continue;
    }
    gh(['api', '-X', found ? 'PUT' : 'POST', target, '--input', '-'], JSON.stringify(spec));
    console.log((found ? 'updated ' : 'created ') + spec.name + ' on ' + repo);
  }
}
if (checkOnly && drift) process.exit(1);
