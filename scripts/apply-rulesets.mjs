#!/usr/bin/env node
/**
 * apply-rulesets.mjs - push rulesets/*.json to a GitHub repository.
 *
 *   node scripts/apply-rulesets.mjs --dry-run
 *   node scripts/apply-rulesets.mjs --repo=TLEWA/dsh-sidebar-row-menu
 *
 * Requires the gh CLI, authenticated with admin rights on the repository.
 * The ruleset applied here is the only authority: do not edit rules in the UI.
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

const dryRun = process.argv.includes('--dry-run');
let repo = flag('--repo');
if (!repo) {
  repo = process.env.GITHUB_REPOSITORY || gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
}
const existing = JSON.parse(gh(['api', 'repos/' + repo + '/rulesets']) || '[]');
const files = readdirSync('rulesets').filter((f) => f.slice(-5) === '.json').sort();
if (files.length === 0) {
  console.error('rulesets/ 下没有 JSON 定义');
  process.exit(1);
}
for (const file of files) {
  const spec = JSON.parse(readFileSync(join('rulesets', file), 'utf8'));
  const found = existing.find((r) => r.name === spec.name);
  const target = found
    ? 'PUT repos/' + repo + '/rulesets/' + found.id
    : 'POST repos/' + repo + '/rulesets';
  if (dryRun) {
    console.log('[dry-run] ' + target + '  ' + spec.name + '  (' + file + ')');
    continue;
  }
  gh(['api', '-X', found ? 'PUT' : 'POST', target, '--input', '-'], JSON.stringify(spec));
  console.log((found ? 'updated ' : 'created ') + spec.name);
}
