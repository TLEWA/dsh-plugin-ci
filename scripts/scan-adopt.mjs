#!/usr/bin/env node
/**
 * scan-adopt.mjs - report how far a plugin repository is from the shared process.
 *
 *   node <canonical>/scripts/scan-adopt.mjs
 *   node <canonical>/scripts/scan-adopt.mjs --json
 *
 * Read-only. Exit code 1 when anything is missing, so CI can use it directly.
 * Run with cwd = the plugin repository.
 */
import { readFileSync, existsSync } from 'node:fs';

const rows = [];
function add(name, ok, detail) { rows.push({ name, ok, detail: ok ? '' : detail || 'missing' }); }
function readJSON(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function readText(file) {
  try { return readFileSync(file, 'utf8'); } catch (e) { return ''; }
}
function references(text, file) {
  return new RegExp('^[ \\t]*uses:[ \\t]*TLEWA/dsh-plugin-ci/\\.github/workflows/' + file + '@v\\d+[ \\t]*$', 'm').test(text);
}

const pkg = readJSON('package.json');
const config = readJSON('ci.config.json');
add('package.json', Boolean(pkg), '缺少或不是合法 JSON');
const patchPath = pkg && pkg.dsh && pkg.dsh.bundle ? String(pkg.dsh.bundle.patch || '').replace(/^\.\//, '') : '';
const patch = patchPath ? readText(patchPath) : '';

if (pkg) {
  add('engines.dsh (top level)', Boolean(pkg.engines && pkg.engines.dsh), '插件必须有顶层 engines.dsh（dsh.engines.dsh 会被忽略）');
  add('engines.node', Boolean(pkg.engines && pkg.engines.node), '缺少 engines.node');
  add('dsh.manifestVersion', Boolean(pkg.dsh && pkg.dsh.manifestVersion === 1), '应为 1');
  add('dsh.bundle.patch 文件存在', Boolean(patchPath) && existsSync(patchPath), patchPath || '未声明');
  if (patch && pkg.name) add('patch insert name == package name', patch.indexOf(pkg.name) >= 0, 'patch 里的 name 与包名不一致');
  const inject = pkg.dsh && pkg.dsh.client ? pkg.dsh.client.inject : undefined;
  if (inject !== undefined) {
    const bare = (Array.isArray(inject) ? inject : []).filter((m) => String(m).charAt(0) !== '@');
    add('dsh.client.inject 无裸模块', bare.length === 0, bare.join(', '));
  }
  add('files 白名单', Array.isArray(pkg.files) && pkg.files.length > 0, 'npm 会发布整个仓库');
  if (Array.isArray(pkg.files) && patchPath) add('patch 在 files 中', pkg.files.some((f) => String(f).replace(/^\.\//, '') === patchPath || String(f).indexOf(patchPath.split('/')[0]) === 0), 'cordis.patch.yml 不在 files');
  add('test 脚本', Boolean(pkg.scripts && pkg.scripts.test), '没有 npm test');
}

add('lockfile', existsSync('package-lock.json') || existsSync('pnpm-lock.yaml'), 'CI 需要可复现安装');
add('ci.config.json', Boolean(config), '用 canonical 的 init-repo.mjs 生成，再按仓库修改');
if (config) {
  add('ci.config.json 无旧键 install/gate/assetAlias', !('install' in config) && !('gate' in config) && !(config.release && 'assetAlias' in config.release), '删掉 install、gate 与 release.assetAlias；新版 schema 见 canonical schema/');
  add('ci.config.json version === 1', config.version === 1, '从 templates/ci.config.json 重新生成');
}
const ci = readText('.github/workflows/ci.yml');
add('ci.yml 调用 reusable-ci', references(ci, 'reusable-ci.yml'), '不要复制 gate 脚本，改用 TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1');
add('drift.yml 调用 reusable-drift', references(readText('.github/workflows/drift.yml'), 'reusable-drift.yml'), '从 templates/workflows/drift.yml 复制');
if (config && config.release && config.release.publish) {
  add('release.yml 调用 reusable-release', references(readText('.github/workflows/release.yml'), 'reusable-release.yml'), '从 templates/workflows/release.yml 复制');
  const pre = pkg && pkg.scripts && pkg.scripts.prepublishOnly ? String(pkg.scripts.prepublishOnly) : '';
  add('prepublishOnly 调用 dsh-ci-gate --prepublish', pre.indexOf('dsh-ci-gate') >= 0 && pre.indexOf('--prepublish') >= 0, '用 dsh-ci-init 写入，或手工加 "prepublishOnly": "npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --prepublish"');
}
add('无本地 gate 副本', !existsSync('scripts/ci-gate.mjs') && !existsSync('scripts/ci-process.json') && !existsSync('scripts/sync-ci.mjs'), '删掉本地 gate/sync 脚本，reusable workflow 会检出到 .ci/');
add('.gitignore 含 .ci/', /^\s*\.ci\/?\s*$/m.test(readText('.gitignore')), '加一行 .ci/');
add('.github/PULL_REQUEST_TEMPLATE.md', existsSync('.github/PULL_REQUEST_TEMPLATE.md'), '复制 templates/PULL_REQUEST_TEMPLATE.md');
add('AGENTS.md', existsSync('AGENTS.md'), '复制 templates/AGENTS.md');
add('.gitattributes', /\*\s+text=auto/.test(readText('.gitattributes')), '加 "* text=auto eol=lf"');
add('README 双语', existsSync('README.en.md') || existsSync('README.zh-CN.md'), 'README 必须中英成对');
add('CHANGELOG 双语', existsSync('CHANGELOG.md') && (existsSync('CHANGELOG.en.md') || existsSync('CHANGELOG.zh-CN.md')), 'CHANGELOG 必须中英成对');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const r of rows) console.log((r.ok ? 'OK   ' : 'MISS ') + r.name + (r.ok ? '' : '  -> ' + r.detail));
  const missing = rows.filter((r) => !r.ok).length;
  console.log('');
  console.log('adoption: ' + (rows.length - missing) + ' ok / ' + missing + ' missing');
}
process.exitCode = rows.some((r) => !r.ok) ? 1 : 0;
