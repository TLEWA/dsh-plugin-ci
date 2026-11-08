#!/usr/bin/env node
/**
 * init-repo.mjs - wire a plugin repository to the canonical reusable workflows.
 *
 *   node <canonical>/scripts/init-repo.mjs
 *   node <canonical>/scripts/init-repo.mjs --full --force
 *
 * Run with cwd = the plugin repository. Writes the thin caller workflows and
 * ci.config.json, adds .ci/ to .gitignore, and (with --full) copies the PR
 * template and AGENTS.md. Never copies the gate script itself.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, '..', 'templates');
const flags = process.argv.slice(2);
const force = flags.includes('--force');
const full = flags.includes('--full');

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

mkdirSync(join(process.cwd(), '.github', 'workflows'), { recursive: true });
copy('workflows/ci.yml', '.github/workflows/ci.yml');
copy('workflows/drift.yml', '.github/workflows/drift.yml');
copy('workflows/release.yml', '.github/workflows/release.yml');
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
