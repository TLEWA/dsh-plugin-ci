#!/usr/bin/env node
/**
 * init-repo.mjs - wire a plugin repository to the canonical reusable workflows.
 *
 *   node <canonical>/scripts/init-repo.mjs
 *   node <canonical>/scripts/init-repo.mjs --npm-token
 *   node <canonical>/scripts/init-repo.mjs --full --force
 *
 * Run with cwd = the plugin repository. Writes the thin caller workflows and
 * ci.config.json, adds .ci/ to .gitignore, and (with --full) copies the PR
 * template and AGENTS.md. --npm-token adds with.use-token to the release
 * caller for repositories that publish with NPM_TOKEN instead of OIDC.
 * Never copies the gate script itself.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, '..', 'templates');
const flags = process.argv.slice(2);
const force = flags.includes('--force');
const full = flags.includes('--full');
const npmToken = flags.includes('--npm-token');

function copy(rel, dest) {
  const to = join(process.cwd(), dest || rel);
  if (existsSync(to) && !force) {
    console.log('skip   ' + dest + ' (exists; use --force)');
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(TEMPLATES, rel), to);
  console.log('write  ' + dest);
}

function enableTokenFallback(dest) {
  const path = join(process.cwd(), dest);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const usesIndex = lines.findIndex((line) => line.includes('uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-release.yml@'));
  if (usesIndex < 0) {
    console.log('warn   ' + dest + ' does not call reusable-release.yml; set use-token manually');
    return;
  }
  const secretsIndex = lines.findIndex((line, i) => i > usesIndex && /^\s*secrets:\s*inherit\s*$/.test(line));
  if (secretsIndex < 0) {
    console.log('warn   ' + dest + ' has no secrets: inherit after reusable-release; set use-token manually');
    return;
  }
  const releaseBlock = lines.slice(usesIndex, secretsIndex);
  if (releaseBlock.some((line) => /^\s+use-token:\s*true\s*$/.test(line))) {
    console.log('skip   ' + dest + ' (use-token already enabled)');
    return;
  }
  if (releaseBlock.some((line) => /^\s+use-token:/.test(line))) {
    console.log('warn   ' + dest + ' already has a use-token entry; set it to true manually');
    return;
  }
  const withIndex = lines.findIndex((line, i) => i > usesIndex && i < secretsIndex && /^\s*with:\s*$/.test(line));
  if (withIndex >= 0) {
    const indent = (lines[withIndex].match(/^\s*/) || [''])[0];
    lines.splice(withIndex + 1, 0, indent + '  use-token: true');
  } else {
    const indent = (lines[usesIndex].match(/^\s*/) || [''])[0];
    lines.splice(secretsIndex, 0, indent + 'with:', indent + '  use-token: true');
  }
  writeFileSync(path, lines.join('\n'));
  console.log('write  ' + dest + ' (+ with.use-token)');
}

mkdirSync(join(process.cwd(), '.github', 'workflows'), { recursive: true });
// 已存在且未传 separate-guard 的 ci.yml 属于旧接线：保留它，并跳过 pr-guard.yml，
// 避免重跑初始化命令把仓库变成“只改一半”的拆分接线（gate 会判红）。
const existingCiPath = join(process.cwd(), '.github', 'workflows', 'ci.yml');
const legacyCi = !force && existsSync(existingCiPath)
  && !/separate-guard:\s*true/.test(readFileSync(existingCiPath, 'utf8'));
copy('workflows/ci.yml', '.github/workflows/ci.yml');
if (legacyCi) {
  console.log('skip   .github/workflows/pr-guard.yml (existing ci.yml keeps the legacy inline guard; migrate ci.yml to separate-guard: true first, or rerun with --force to switch to the split wiring)');
} else {
  copy('workflows/pr-guard.yml', '.github/workflows/pr-guard.yml');
}
copy('workflows/ci-rerun.yml', '.github/workflows/ci-rerun.yml');
copy('workflows/drift.yml', '.github/workflows/drift.yml');
copy('workflows/release.yml', '.github/workflows/release.yml');
if (npmToken) enableTokenFallback('.github/workflows/release.yml');
const pkgPath = join(process.cwd(), 'package.json');
if (existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts = pkg.scripts || {};
    if (!pkg.scripts.prepublishOnly) {
      pkg.scripts.prepublishOnly = 'npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --prepublish';
      const raw = readFileSync(pkgPath, 'utf8');
      const indentMatch = raw.match(/\n([ \t]+)"/);
      const indent = indentMatch ? indentMatch[1] : '  ';
      writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + '\n');
      console.log('write  package.json (+ scripts.prepublishOnly)');
    } else if (String(pkg.scripts.prepublishOnly).indexOf('dsh-ci-gate') < 0) {
      console.log('warn   package.json has a prepublishOnly script; add dsh-ci-gate --prepublish manually');
    }
  } catch (e) {
    console.log('warn   package.json is not valid JSON; the gate will report it');
  }
}
copy('ci.config.json', 'ci.config.json');
if (full) {
  copy('PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md');
  copy('AGENTS.md', 'AGENTS.md');
}

const gi = join(process.cwd(), '.gitignore');
let text = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
if (!/^\s*\.ci\/?\s*$/m.test(text)) {
  text = text.length && text.slice(-1) !== '\n' ? text + '\n' : text;
  writeFileSync(gi, text + '.ci/\n');
  console.log('write  .gitignore (+ .ci/)');
}

console.log('');
console.log('wired ' + process.cwd() + ' to TLEWA/dsh-plugin-ci@v1');
console.log('next: edit ci.config.json for this plugin, commit, and open a PR.');
