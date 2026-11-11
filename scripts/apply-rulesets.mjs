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
import { pathToFileURL } from 'node:url';

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

export function rulesetEndpoint(repo, found) {
  return 'repos/' + repo + '/rulesets' + (found ? '/' + found.id : '');
}

function subset(expected, actual) {
  if (expected === null || typeof expected !== 'object') return expected === actual;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((v, i) => subset(v, actual[i]));
  }
  if (!actual || typeof actual !== 'object') return false;
  return Object.keys(expected).every((k) => subset(expected[k], actual[k]));
}

// 旧接线（未传 separate-guard）不会产生 pr-guard / guard check，required check 必须相应裁剪，
// 否则一次规则下发就会让仍在 v1 旧接线的仓库无法合并。
export function adaptRuleset(spec, split) {
  return {
    ...spec,
    rules: spec.rules.map((rule) => {
      if (rule.type !== 'required_status_checks') return rule;
      const checks = rule.parameters.required_status_checks.filter((c) => split || c.context !== 'pr-guard / guard');
      return { ...rule, parameters: { ...rule.parameters, required_status_checks: checks } };
    }),
  };
}

function repoUsesSplitGuard(repo) {
  try {
    const raw = gh(['api', 'repos/' + repo + '/contents/.github/workflows/ci.yml', '-H', 'Accept: application/vnd.github.raw']);
    return /separate-guard:\s*true/.test(raw);
  } catch (e) {
    throw new Error('无法读取 ' + repo + ' 的 .github/workflows/ci.yml，无法判断是否已迁移到拆分接线：' + String(e.stderr || e.message).trim());
  }
}

// GitHub adds default parameters and may reorder rules. Compare the declared
// contract as a subset keyed by rule type instead of raw API output.
export function rulesMatch(expectedRules, liveRules) {
  if (!Array.isArray(expectedRules) || !Array.isArray(liveRules)) return false;
  const live = new Map(liveRules.map((r) => [r.type, r]));
  if (live.size !== expectedRules.length) return false;
  return expectedRules.every((rule) => {
    const other = live.get(rule.type);
    return other && subset(rule, other);
  });
}

function main() {
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
    const split = repoUsesSplitGuard(repo);
    console.log((split ? 'split  ' : 'legacy ') + repo + '  (required checks follow its ci.yml)');
    for (const file of files) {
      const spec = adaptRuleset(JSON.parse(readFileSync(join('rulesets', file), 'utf8')), split);
      const found = existing.find((r) => r.name === spec.name);
      if (checkOnly) {
        let live = null;
        if (found) live = JSON.parse(gh(['api', 'repos/' + repo + '/rulesets/' + found.id]));
        const keys = ['target', 'enforcement', 'conditions', 'bypass_actors'];
        const same = live && keys.every((k) => stable(live[k]) === stable(spec[k])) && rulesMatch(spec.rules, live.rules);
        console.log((same ? 'ok    ' : 'DRIFT ') + repo + '  ' + spec.name);
        if (!same) {
          drift = true;
          if (live) {
            for (const k of keys) if (stable(live[k]) !== stable(spec[k])) console.log('       differs: ' + k);
            if (!rulesMatch(spec.rules, live.rules)) console.log('       differs: rules');
          }
        }
        continue;
      }
      const target = rulesetEndpoint(repo, found);
      if (dryRun) {
        console.log('[dry-run] ' + (found ? 'PUT ' : 'POST ') + target + '  ' + spec.name + '  (' + file + ')');
        continue;
      }
      gh(['api', '-X', found ? 'PUT' : 'POST', target, '--input', '-'], JSON.stringify(spec));
      console.log((found ? 'updated ' : 'created ') + spec.name + ' on ' + repo);
    }
  }
  if (checkOnly && drift) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
