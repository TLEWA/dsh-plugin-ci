#!/usr/bin/env node
/**
 * ci-gate.mjs - the single strict gate shared by every TLEWA DSH plugin.
 *
 * Zero dependencies, Node >= 20, ESM. Run from the repository root.
 *
 *   node .ci/scripts/ci-gate.mjs              # verify (offline, default)
 *   node .ci/scripts/ci-gate.mjs --only=manifest
 *   node .ci/scripts/ci-gate.mjs --release        # release preflight (network)
 *   node .ci/scripts/ci-gate.mjs --after-publish  # post-publish attestation (network)
 *   node .ci/scripts/ci-gate.mjs --prepublish     # refuses local npm publish
 *   node .ci/scripts/ci-gate.mjs --pr             # PR guard (GitHub Actions only)
 *
 * The gate lives in the canonical repository and runs with cwd = the repository
 * under test. Reusable workflows check the canonical repo out to .ci/ and call
 * it from there; downstream repositories never carry a copy of this file.
 *
 * Exit code 0 = all selected checks green, 1 = at least one red, 2 = gate bug.
 */
import { readFileSync, existsSync, statSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const NPM_CACHE = join(tmpdir(), 'dsh-plugin-ci-npm-cache');
const CMD_RE = /^(npm|npx|node|pnpm|yarn|git|gh|dsh|curl|tar|sha256sum|powershell|pwsh|del|copy|cp|mv|rm)\b/;

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const o = { only: [], skip: [], json: false, mode: 'verify' };
  for (const a of argv) {
    if (a === '--json') o.json = true;
    else if (a === '--pr') o.mode = 'guard';
    else if (a === '--release' || a === '--preflight') o.mode = 'release';
    else if (a === '--after-publish') o.mode = 'after';
    else if (a === '--prepublish') o.mode = 'prepublish';
    else if (a === '--verify') o.mode = 'verify';
    else if (a.indexOf('--only=') === 0) o.only.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a.indexOf('--skip=') === 0) o.skip.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}
const OPTS = parseArgs(process.argv.slice(2));

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

class GateError extends Error {
  constructor(message, fix) {
    super(message);
    this.fix = fix;
  }
}

const results = [];
let CURRENT_ID = '';
let INTERNAL = 0;
function report(id, status, msg, fix) { results.push({ id, status, msg, fix: fix || null }); }
function ok(msg) { report(CURRENT_ID, 'ok', msg || '通过'); }
function fail(id, msg, fix) { report(id, 'fail', msg, fix); }
function warn(msg) { report(CURRENT_ID, 'warn', msg); }
function skip(msg) { report(CURRENT_ID, 'skip', msg); }
function must(cond, msg, fix) { if (!cond) throw new GateError(msg, fix); }

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && !process.env.CI;
function paint(code, s) { return useColor ? '\x1b[' + code + 'm' + s + '\x1b[0m' : s; }

function selected(id) {
  const m = (p) => id === p || id.indexOf(p + '.') === 0 || p === id.split('.')[0];
  if (OPTS.only.length > 0 && !OPTS.only.some(m)) return false;
  if (OPTS.skip.some(m)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function read(p) { return readFileSync(join(ROOT, p), 'utf8'); }
function readJSON(p) { return JSON.parse(read(p)); }
function has(p) { try { return existsSync(join(ROOT, p)); } catch (e) { return false; } }
function isDir(p) { try { return statSync(join(ROOT, p)).isDirectory(); } catch (e) { return false; } }
function escRe(s) {
  return String(s).replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$/g, '\\$&');
}
function tail(s, n) {
  const lines = String(s || '').trim().split(/\r?\n/);
  return lines.slice(-(n || 12)).join('\n');
}
function sh(cmd) {
  mkdirSync(NPM_CACHE, { recursive: true });
  const r = spawnSync(cmd, {
    shell: true,
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { npm_config_cache: NPM_CACHE, NO_COLOR: '1' }),
  });
  return { code: r.status === null ? 1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function git(args, allowFail) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) {
    throw new GateError('git ' + args.join(' ') + ' 失败: ' + tail(r.stderr, 5), '确认在 git 仓库根目录运行，且 git 可用');
  }
  return r;
}
function walk(dir, out) {
  out = out || [];
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = dir + '/' + name;
    if (isDir(p)) walk(p, out);
    else out.push(p);
  }
  return out;
}
function globToRegExp(pat) {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') {
      if (pat[i + 1] === '*') {
        if (pat[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += escRe(c);
  }
  return new RegExp('^' + re + '$');
}
function hasGlob(s) { return s.indexOf('*') >= 0 || s.indexOf('?') >= 0; }
function expandGlob(pat) {
  const re = globToRegExp(pat);
  const dir = pat.indexOf('/') >= 0 ? pat.slice(0, pat.lastIndexOf('/')) : '.';
  if (!isDir(dir)) return [];
  return walk(dir).map((f) => f.replace(/^\.\//, '')).filter((f) => re.test(f));
}
function coveredBy(entries, file) {
  for (const raw of entries || []) {
    const p = String(raw).replace(/^\.\//, '').replace(/\/$/, '');
    if (hasGlob(p)) { if (globToRegExp(p).test(file)) return true; }
    else if (file === p || file.indexOf(p + '/') === 0) return true;
  }
  return false;
}
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || line[i - 1] === ' ')) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}
function scalar(raw) {
  const s = raw.trim();
  if (s === '') return null;
  if (s === '{}') return {};
  if (s === '[]') return [];
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") || (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"')) {
    return s.slice(1, -1);
  }
  return s;
}

/** Tiny YAML subset parser: sequences, maps, quoted scalars, comments. */
function parseYamlSubset(text) {
  const toks = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const expanded = rawLine.replace(/\t/g, '    ');
    const t = expanded.trim();
    if (t.charAt(0) === '#' || t === '---' || t === '...') continue;
    toks.push({ indent: expanded.length - expanded.trimStart().length, text: stripComment(t) });
  }
  if (toks.length === 0) return null;
  let i = 0;
  function isSeq(t) { return t === '-' || t.indexOf('- ') === 0; }
  function isKey(t) { return /^[^:]+:(\s.*)?$/.test(t); }
  function parseNode(indent) { return isSeq(toks[i].text) ? parseSeq(indent) : parseMap(indent); }
  function parseSeq(indent) {
    const out = [];
    while (i < toks.length && toks[i].indent === indent && isSeq(toks[i].text)) {
      const t = toks[i].text;
      const rest = t === '-' ? '' : t.slice(2).trim();
      i++;
      if (rest === '') {
        out.push(i < toks.length && toks[i].indent > indent ? parseNode(toks[i].indent) : null);
      } else if (isKey(rest)) {
        out.push(parseMapAt(indent + 2, rest));
      } else {
        out.push(scalar(rest));
      }
    }
    return out;
  }
  function parseMap(indent) { return parseMapAt(indent, null); }
  function parseMapAt(indent, first) {
    const obj = {};
    if (first !== null) applyEntry(obj, first, indent);
    while (i < toks.length && toks[i].indent === indent && !isSeq(toks[i].text)) {
      const t = toks[i].text;
      i++;
      applyEntry(obj, t, indent);
    }
    return obj;
  }
  function applyEntry(obj, line, keyIndent) {
    const m = line.match(/^([^:]+):(.*)$/);
    if (!m) throw new Error('不支持的 YAML 语法: ' + line);
    const key = m[1].trim();
    const val = m[2].trim();
    if (val !== '') { obj[key] = scalar(val); return; }
    if (i < toks.length && (toks[i].indent > keyIndent || (toks[i].indent === keyIndent && isSeq(toks[i].text)))) {
      obj[key] = parseNode(toks[i].indent);
    } else {
      obj[key] = null;
    }
  }
  return parseNode(toks[0].indent);
}

/* ------------------------------------------------------------------ */
/* Config schema                                                       */
/* ------------------------------------------------------------------ */

const S = {
  string: { kind: 'string' },
  number: { kind: 'number' },
  boolean: { kind: 'boolean' },
  strings: { kind: 'array', items: { kind: 'string' } },
  obj: (props, required) => ({ kind: 'object', props, required: required || [] }),
  arr: (items) => ({ kind: 'array', items }),
  tuple: (items) => ({ kind: 'tuple', items }),
  enum: (...values) => ({ kind: 'enum', values }),
  literal: (value) => ({ kind: 'literal', value }),
  nullable: (of) => ({ kind: 'nullable', of }),
};

const CONFIG_SPEC = S.obj({
  $schema: S.string,
  selfHosted: S.boolean,
  version: S.literal(1),
  build: S.nullable(S.obj({
    command: S.string,
    artifacts: S.strings,
    mode: S.enum('git-diff', 'check-flag'),
  }, ['command', 'artifacts', 'mode'])),
  typecheck: S.nullable(S.string),
  test: S.nullable(S.string),
  testGlobs: S.strings,
  manifest: S.nullable(S.obj({
    manifestVersion: S.number,
    requireEnginesNode: S.boolean,
    allowedInject: S.strings,
  }, ['manifestVersion', 'requireEnginesNode', 'allowedInject'])),
  docs: S.obj({
    pairs: S.arr(S.tuple([S.string, S.string])),
    required: S.strings,
    published: S.strings,
  }, ['pairs', 'required', 'published']),
  tarball: S.nullable(S.obj({
    mustInclude: S.strings,
    mustExclude: S.strings,
    maxBytes: S.number,
  }, ['mustInclude', 'mustExclude', 'maxBytes'])),
  release: S.obj({
    publish: S.boolean,
    provenance: S.boolean,
  }, ['publish', 'provenance']),
  guards: S.obj({
    requireHumanApprovedLabel: S.boolean,
  }, ['requireHumanApprovedLabel']),
}, ['version', 'build', 'typecheck', 'test', 'testGlobs', 'manifest', 'docs', 'tarball', 'release', 'guards']);

function validateSpec(spec, val, path, errs) {
  if (spec.kind === 'nullable') {
    if (val === null) return;
    validateSpec(spec.of, val, path, errs);
    return;
  }
  if (spec.kind === 'literal') {
    if (val !== spec.value) errs.push(path + ' 必须等于 ' + JSON.stringify(spec.value));
    return;
  }
  if (spec.kind === 'enum') {
    if (spec.values.indexOf(val) < 0) errs.push(path + ' 必须是 ' + spec.values.join(' | ') + ' 之一，实际是 ' + JSON.stringify(val));
    return;
  }
  if (spec.kind === 'string') { if (typeof val !== 'string') errs.push(path + ' 必须是字符串'); return; }
  if (spec.kind === 'number') { if (typeof val !== 'number' || !Number.isFinite(val)) errs.push(path + ' 必须是数字'); return; }
  if (spec.kind === 'boolean') { if (typeof val !== 'boolean') errs.push(path + ' 必须是布尔值'); return; }
  if (spec.kind === 'array') {
    if (!Array.isArray(val)) { errs.push(path + ' 必须是数组'); return; }
    val.forEach((v, i) => validateSpec(spec.items, v, path + '[' + i + ']', errs));
    return;
  }
  if (spec.kind === 'tuple') {
    if (!Array.isArray(val) || val.length !== spec.items.length) { errs.push(path + ' 必须是 ' + spec.items.length + ' 元组'); return; }
    spec.items.forEach((s, i) => validateSpec(s, val[i], path + '[' + i + ']', errs));
    return;
  }
  if (spec.kind === 'object') {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) { errs.push(path + ' 必须是对象'); return; }
    for (const k of Object.keys(val)) if (!spec.props[k]) errs.push(path + '.' + k + ' 是未知键（检查拼写）');
    for (const k of spec.required) if (!(k in val)) errs.push(path + '.' + k + ' 缺失');
    for (const k of Object.keys(spec.props)) if (k in val) validateSpec(spec.props[k], val[k], path + '.' + k, errs);
    return;
  }
}

let CFG = null;
let PKG = null;

function loadConfig() {
  if (CFG) return CFG;
  must(has('ci.config.json'), '缺少 ci.config.json（从 dsh-plugin-ci/templates/ci.config.json 复制）', 'cp <canonical>/templates/ci.config.json ci.config.json');
  let raw;
  try { raw = readJSON('ci.config.json'); }
  catch (e) { throw new GateError('ci.config.json 不是合法 JSON: ' + e.message, '修正 JSON 语法'); }
  const errs = [];
  validateSpec(CONFIG_SPEC, raw, 'ci.config.json', errs);
  must(errs.length === 0, 'ci.config.json 不合法：\n' + errs.map((e) => '    - ' + e).join('\n'), '对照 schema/ci.config.schema.json 修正');
  CFG = raw;
  return CFG;
}
function cfg() { if (!CFG) loadConfig(); return CFG; }
function pkg() {
  if (PKG) return PKG;
  must(has('package.json'), '缺少 package.json', '补 package.json');
  try { PKG = readJSON('package.json'); }
  catch (e) { throw new GateError('package.json 不是合法 JSON: ' + e.message, '修正 JSON 语法'); }
  return PKG;
}
function repoName() {
  if (process.env.GITHUB_REPOSITORY) {
    const p = process.env.GITHUB_REPOSITORY.split('/');
    return p[p.length - 1];
  }
  const r = spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const url = String(r.stdout || '').trim();
  if (!url) return null;
  return url.replace(/\.git$/, '').split(/[\/:]/).pop();
}

function isRange(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (!/^[<>=^~v\s0-9xX*.\-+A-Za-z]+$/.test(s)) return false;
  if (!/\d/.test(s)) return false;
  if (s.indexOf('..') >= 0) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Check registry                                                      */
/* ------------------------------------------------------------------ */

const checks = [];
function check(id, fn, modes) { checks.push({ id, fn, modes: modes || ['verify', 'release'] }); }

/* ------------------------------------------------------------------ */
/* Verify checks                                                       */
/* ------------------------------------------------------------------ */

check('config.schema', () => {
  const c = loadConfig();
  ok('ci.config.json 合法（manifest=' + (c.manifest ? 'yes' : 'null') + ', release.publish=' + String(c.release.publish) + '）');
});

function yamlText(p) { return has(p) ? read(p) : ''; }
function usesRemote(text, file) {
  return new RegExp('^[ \\t]*uses:[ \\t]*TLEWA/dsh-plugin-ci/\\.github/workflows/' + escRe(file) + '@v\\d+[ \\t]*$', 'm').test(text);
}
function usesLocal(text, file) {
  return new RegExp('^[ \\t]*uses:[ \\t]*\\./\\.github/workflows/' + escRe(file) + '[ \\t]*$', 'm').test(text);
}

check('wiring.workflows', () => {
  const c = cfg();
  const problems = [];
  const ci = yamlText('.github/workflows/ci.yml');
  if (!ci) problems.push('缺少 .github/workflows/ci.yml');
  else if (c.selfHosted) {
    if (!usesLocal(ci, 'reusable-ci.yml')) problems.push('selfHosted 仓的 ci.yml 必须调用 ./.github/workflows/reusable-ci.yml');
    for (const f of ['reusable-ci.yml', 'reusable-release.yml', 'reusable-drift.yml']) {
      if (!has('.github/workflows/' + f)) problems.push('selfHosted 仓缺少 .github/workflows/' + f);
    }
  } else if (!usesRemote(ci, 'reusable-ci.yml')) {
    problems.push('ci.yml 必须调用 TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v<major>（不要复制 gate 脚本）');
  }
  if (!c.selfHosted) {
    const drift = yamlText('.github/workflows/drift.yml');
    if (!drift) problems.push('缺少 .github/workflows/drift.yml');
    else if (!usesRemote(drift, 'reusable-drift.yml')) problems.push('drift.yml 必须调用 TLEWA/dsh-plugin-ci/.github/workflows/reusable-drift.yml@v<major>');
  }
  if (c.release.publish) {
    const release = yamlText('.github/workflows/release.yml');
    if (!release) problems.push('release.publish=true 但缺少 .github/workflows/release.yml');
    else if (c.selfHosted) {
      if (!usesLocal(release, 'reusable-release.yml')) problems.push('selfHosted 仓的 release.yml 必须调用 ./.github/workflows/reusable-release.yml');
    } else if (!usesRemote(release, 'reusable-release.yml')) {
      problems.push('release.yml 必须调用 TLEWA/dsh-plugin-ci/.github/workflows/reusable-release.yml@v<major>');
    }
  }
  const forbidden = c.selfHosted
    ? ['scripts/ci-process.json', 'scripts/sync-ci.mjs']
    : ['scripts/ci-gate.mjs', 'scripts/ci-process.json', 'scripts/sync-ci.mjs'];
  for (const f of forbidden) {
    if (has(f)) problems.push(f + ' 不应存在：外部仓的 gate 由 reusable workflow 从中心仓检出到 .ci/，selfHosted 仓只允许 vendoring gate 本身');
  }
  if (!c.selfHosted) {
    const ignore = has('.gitignore') ? read('.gitignore') : '';
    if (!/^\s*\.ci\/?\s*$/m.test(ignore)) problems.push('.gitignore 缺少 .ci/ 条目（reusable workflow 会把中心仓检出到 .ci/）');
  }
  const ciText = yamlText('.github/workflows/ci.yml') || '';
  if (/types:\s*\[[^\]]*\blabeled\b/.test(ciText)) {
    problems.push('ci.yml 不应监听 pull_request 的 labeled/unlabeled：加标签会新建第二次 run，同一 SHA 上留下两套 check suite，ruleset 会判 BLOCKED');
  }
  const rerun = yamlText('.github/workflows/ci-rerun.yml');
  if (!rerun) {
    problems.push('缺少 .github/workflows/ci-rerun.yml：标签变化应重跑原 ci run，而不是新建一次 CI');
  } else {
    if (!/(?:pull_request|pull_request_target):/.test(rerun) || !/types:\s*\[[^\]]*\blabeled\b/.test(rerun)) problems.push('ci-rerun.yml 必须在 pull_request 或 pull_request_target 的 labeled/unlabeled 事件上运行（fork PR 需要 pull_request_target 才有 actions: write）');
    if (!/actions:\s*write/.test(rerun)) problems.push('ci-rerun.yml 需要 permissions.actions: write 才能重跑 run');
    if (!/\/rerun/.test(rerun)) problems.push('ci-rerun.yml 必须调用 Actions 的 run rerun 接口（POST /repos/{owner}/{repo}/actions/runs/{id}/rerun）');
  }
  must(problems.length === 0, '仓库接线不符合中心仓约定：\n' + problems.map((x) => '    - ' + x).join('\n'),
    '在插件仓根目录运行 npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-init 生成 caller workflow，或对照 templates/workflows/');
  ok('caller workflow 与中心仓接线一致');
});

check('wiring.repository', () => {
  const c = cfg();
  if (!c.release.publish) { skip('release.publish=false，无需核对 npm repository'); return; }
  const p = pkg();
  const raw = typeof p.repository === 'string' ? p.repository : p.repository && p.repository.url;
  must(typeof raw === 'string' && raw.length > 0,
    'release.publish=true 时 package.json 必须声明 repository（npm provenance 会核对仓地址）',
    '加 "repository": { "type": "git", "url": "https://github.com/TLEWA/<repo>.git" }');
  const norm = String(raw).replace(/^git\+/, '').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '').replace(/\/$/, '');
  if (process.env.GITHUB_REPOSITORY) {
    const expected = 'https://github.com/' + process.env.GITHUB_REPOSITORY;
    must(norm === expected, 'package.json repository (' + norm + ') 必须等于 ' + expected, '改成 ' + expected + '.git');
  } else {
    must(norm.indexOf('/' + p.name.split('/').pop()) >= 0, 'repository (' + norm + ') 与包名 ' + p.name + ' 不一致', '改成插件仓地址');
  }
  ok('repository 与发布仓一致');
});

check('wiring.prepublish', () => {
  const c = cfg();
  if (!c.release.publish) { skip('release.publish=false，无需本地发布守卫'); return; }
  const p = pkg();
  const cmd = p.scripts && p.scripts.prepublishOnly;
  must(typeof cmd === 'string' && cmd.indexOf('dsh-ci-gate') >= 0 && cmd.indexOf('--prepublish') >= 0,
    'release.publish=true 时 package.json 的 prepublishOnly 必须调用 dsh-ci-gate --prepublish，否则本机 npm publish 不会被拦截',
    '加 "prepublishOnly": "npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --prepublish"');
  ok('prepublishOnly 已接本地发布守卫');
});

check('manifest.name', () => {
  const p = pkg();
  must(typeof p.name === 'string' && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(p.name),
    'package.json name 不是合法 npm 包名: ' + String(p.name), '改成小写 kebab-case 包名');
  must(typeof p.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(p.version),
    'version 必须是 x.y.z（可带 prerelease）: ' + String(p.version), '修正 package.json version');
  if (!cfg().manifest) { skip('manifest=null（非 DSH 插件仓）'); return; }
  const repo = repoName();
  if (repo) must(repo === p.name, 'GitHub 仓库名 ' + repo + ' 与包名 ' + p.name + ' 不一致', '统一仓库名与 package.json name');
  ok('包名 ' + p.name + '@' + p.version);
});

check('manifest.bundle', () => {
  if (!cfg().manifest) { skip('manifest=null'); return; }
  const p = pkg();
  const patchPath = p.dsh && p.dsh.bundle ? p.dsh.bundle.patch : null;
  must(typeof patchPath === 'string' && patchPath.length > 0,
    'package.json 缺少 dsh.bundle.patch', '加 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }');
  const rel = patchPath.replace(/^\.\//, '');
  must(has(rel), 'dsh.bundle.patch 指向的文件不存在: ' + patchPath, '修正路径或补上 ' + rel);
  let tree;
  try { tree = parseYamlSubset(read(rel)); }
  catch (e) { throw new GateError(rel + ' 解析失败（仅支持 YAML 子集）: ' + e.message, '按模板保持 序列/map/引号标量 结构'); }
  const inserts = [];
  (function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (k === 'insert' && Array.isArray(node[k])) {
          node[k].forEach((it) => { if (it && typeof it === 'object') inserts.push(it); });
        } else visit(node[k]);
      }
    }
  })(tree);
  must(inserts.length > 0, rel + ' 中没有 insert 列表', '按模板写 "- insert: [ { id, name } ]"');
  for (const it of inserts) {
    must(typeof it.name === 'string' && it.name.trim().length > 0, rel + ' 的 insert 条目缺少 name 字符串', '每个 insert 条目必须写 name: 包名');
    must(typeof it.id === 'string' && it.id.trim().length > 0, rel + ' 的 insert 条目缺少 id', '每个 insert 条目必须写 id: 短名');
  }
  const names = inserts.map((it) => it.name);
  must(names.indexOf(p.name) >= 0,
    rel + ' 的 insert name (' + names.join(', ') + ') 与包名 ' + p.name + ' 不一致',
    '把 name 改成 "' + p.name + '"（宿主按包名解析）');
  ok(rel + ' 插入 ' + p.name + '（id=' + inserts[0].id + '）');
});

check('manifest.engines', () => {
  if (!cfg().manifest) { skip('manifest=null'); return; }
  const p = pkg();
  const c = cfg().manifest;
  const e = p.engines || {};
  must(typeof e.dsh === 'string' && e.dsh.trim().length > 0,
    '缺少顶层 engines.dsh（宿主与插件市场只读顶层 engines.dsh，dsh.engines.dsh 会被忽略）',
    '在 package.json 加 "engines": { "dsh": ">=0.2.1-rc.5 <0.3.0-0" }');
  must(isRange(e.dsh), 'engines.dsh 不是合法 semver range: ' + e.dsh, '例：">=0.2.1-rc.5 <0.3.0-0"');
  if (c.requireEnginesNode) {
    must(typeof e.node === 'string' && e.node.trim().length > 0, '缺少 engines.node', '加 "node": ">=20"');
    must(isRange(e.node), 'engines.node 不是合法 semver range: ' + e.node, '加 "node": ">=20"');
  }
  const mv = p.dsh ? p.dsh.manifestVersion : undefined;
  must(mv === c.manifestVersion, 'dsh.manifestVersion 必须是 ' + c.manifestVersion + '（实际 ' + String(mv) + '）', '在 package.json 的 dsh 里加 "manifestVersion": ' + c.manifestVersion);
  if (p.dsh && p.dsh.engines && p.dsh.engines.dsh && p.dsh.engines.dsh !== e.dsh) {
    warn('dsh.engines.dsh (' + p.dsh.engines.dsh + ') 与顶层 engines.dsh 不一致，重复声明会被忽略');
  }
  ok('engines.dsh=' + e.dsh + '，manifestVersion=' + mv);
});

check('manifest.exports', () => {
  if (!cfg().manifest) { skip('manifest=null'); return; }
  const p = pkg();
  const c = cfg().manifest;
  const targets = (val, out) => {
    out = out || [];
    if (typeof val === 'string') out.push(val);
    else if (Array.isArray(val)) val.forEach((v) => targets(v, out));
    else if (val && typeof val === 'object') Object.keys(val).forEach((k) => targets(val[k], out));
    return out;
  };
  if (p.main) must(has(String(p.main).replace(/^\.\//, '')), 'main 指向的文件不存在: ' + p.main, '先构建，或修正 main');
  for (const key of Object.keys(p.exports || {})) {
    for (const t of targets(p.exports[key])) {
      must(has(String(t).replace(/^\.\//, '')), 'exports["' + key + '"] 指向的文件不存在: ' + t, '补构建产物或修正 exports');
    }
  }
  if (p.dsh && p.dsh.client) {
    const clientTargets = targets(p.exports && p.exports['./client']);
    must(clientTargets.length > 0, 'dsh.client 存在但缺少 exports["./client"]', '加 "exports": { "./client": "./lib/client.js" }');
    const inject = p.dsh.client.inject;
    if (inject !== undefined) {
      must(Array.isArray(inject), 'dsh.client.inject 必须是数组', '改成数组');
      for (const name of inject) {
        const allowed = c.allowedInject.some((pat) => {
          if (pat === name) return true;
          if (pat.slice(-2) === '/*') return name.indexOf(pat.slice(0, -1)) === 0;
          return false;
        });
        must(allowed, 'dsh.client.inject 含未授权模块: ' + String(name), '只允许 ' + c.allowedInject.join(', ') + '（裸模块名如 "react" 不被接受）');
      }
    }
  }
  ok('exports / main / inject 均指向真实文件');
});

check('files.present', () => {
  const c = cfg();
  const p = pkg();
  const files = p.files;
  if (c.tarball) must(Array.isArray(files) && files.length > 0, 'package.json 缺少 files 白名单（npm 会发布整个仓库）', '加 "files": ["lib", ...]');
  for (const raw of files || []) {
    const entry = String(raw).replace(/^\.\//, '');
    const found = hasGlob(entry) ? expandGlob(entry).length > 0 : has(entry.replace(/\/$/, '')) || has(entry);
    must(found, 'files 条目不存在或没有匹配到文件: ' + raw, '修正 files 或补上该文件');
  }
  for (const doc of c.docs.required) must(has(doc), '必需文档缺失: ' + doc, '补上 ' + doc);
  if (Array.isArray(files)) {
    for (const doc of c.docs.published) {
      must(coveredBy(files, doc), doc + ' 没有包含在 package.json files 中（安装后使用者看不到）', '把 ' + doc + ' 加进 files');
    }
  }
  ok('files / 必需文档 / 发布文档 全部就位');
});

check('tarball.contents', () => {
  const c = cfg();
  if (!c.tarball) { skip('tarball=null'); return; }
  const p = pkg();
  const r = sh('npm pack --dry-run --json --ignore-scripts');
  must(r.code === 0, 'npm pack --dry-run 失败: ' + tail(r.out, 15), '先修好构建/打包错误');
  const start = r.out.indexOf('[');
  const end = r.out.lastIndexOf(']');
  must(start >= 0 && end > start, 'npm pack --json 没有输出 JSON: ' + tail(r.out, 8), '确认 npm >= 9，且 package.json 合法');
  let info;
  try { info = JSON.parse(r.out.slice(start, end + 1))[0]; }
  catch (e) { throw new GateError('npm pack JSON 解析失败: ' + e.message, '检查 npm 版本'); }
  must(info && Array.isArray(info.files), 'npm pack 输出缺少 files 列表', '检查 npm 版本');
  const paths = info.files.map((f) => f.path);
  for (const want of c.tarball.mustInclude) {
    const hit = paths.indexOf(want) >= 0 || paths.some((x) => x.indexOf(want.replace(/\/$/, '') + '/') === 0);
    must(hit, 'tarball 缺少必需文件: ' + want, '把 ' + want + ' 加进 files');
  }
  for (const pat of c.tarball.mustExclude) {
    const re = globToRegExp(pat);
    const hit = paths.filter((x) => re.test(x));
    must(hit.length === 0, 'tarball 含禁止文件: ' + hit.slice(0, 4).join(', '), '在 files 白名单或 .npmignore 中排除 ' + pat);
  }
  must(!paths.some((x) => x.indexOf('node_modules/') === 0), 'tarball 含 node_modules', '不要把 node_modules 打进包');
  const size = Number(info.size || 0);
  must(size <= c.tarball.maxBytes, 'tarball ' + size + ' 字节超过上限 ' + c.tarball.maxBytes, '精简发布内容');
  must(info.version === p.version, 'tarball 版本 ' + info.version + ' 与 package.json ' + p.version + ' 不一致', '重新打包');
  ok('tarball ' + paths.length + ' 个文件 / ' + (size / 1024).toFixed(1) + ' KiB');
});

check('artifacts.fresh', () => {
  const c = cfg();
  if (!c.build) { skip('build=null'); return; }
  const r = sh(c.build.command);
  must(r.code === 0, '构建失败（' + c.build.command + '）: ' + tail(r.out, 15), '先在本地跑通构建');
  for (const a of c.build.artifacts) must(has(a), '构建产物不存在: ' + a, '检查构建输出路径');
  if (c.build.mode === 'check-flag') { ok('构建通过（check-flag 模式）'); return; }
  const st = git(['status', '--porcelain', '--untracked-files=all', '--'].concat(c.build.artifacts));
  must(!String(st.stdout).trim(), '构建后产物与已提交版本不一致（产物不新鲜）： ' + String(st.stdout).trim().split(/\r?\n/).slice(0, 6).join(' | '), '运行 ' + c.build.command + ' 后提交产物');
  ok('构建产物与源码同步');
});

check('typecheck', () => {
  const c = cfg();
  if (!c.typecheck) { skip('typecheck=null'); return; }
  const r = sh(c.typecheck);
  must(r.code === 0, '类型检查失败（' + c.typecheck + '）: ' + tail(r.out, 15), '修复类型错误，不要放宽 tsconfig');
  ok('类型检查通过');
});

check('tests', () => {
  const c = cfg();
  if (!c.test) { skip('test=null'); return; }
  const r = sh(c.test);
  must(r.code === 0, '测试失败（' + c.test + '）: ' + tail(r.out, 15), '修复测试或实现；不要在 CI 里跳过断言');
  ok('测试通过（' + c.test + '）');
  const dir = ['test', 'tests'].find((d) => isDir(d));
  if (dir && c.testGlobs.length > 0) {
    const files = walk(dir).map((f) => f.replace(/^\.\//, ''));
    const looks = files.filter((f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f) || /(^|\/)test[-_].*\.(mjs|js|cjs)$/.test(f));
    const uncovered = looks.filter((f) => !c.testGlobs.some((g) => globToRegExp(g).test(f)));
    if (uncovered.length > 0) warn('以下测试文件不会被 test 命令收集，若是手工 E2E 请写进 PR 清单: ' + uncovered.slice(0, 6).join(', '));
  }
});

/* --- docs ---------------------------------------------------------- */

function isFence(line) {
  const t = line.trim();
  return t.indexOf(String.fromCharCode(96, 96, 96)) === 0 || t.indexOf('~~~') === 0;
}
function headingLines(text) {
  const out = [];
  let fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (isFence(line)) { fence = !fence; continue; }
    if (fence) continue;
    if (/^#{1,6}\s+/.test(line)) out.push(line.trim());
  }
  return out;
}
function codeCommands(text) {
  const out = [];
  let fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (isFence(line)) { fence = !fence; continue; }
    if (!fence) continue;
    let t = line.trim();
    if (!t || t.charAt(0) === '#') continue;
    if (t.slice(0, 2) === '$ ') t = t.slice(2).trim();
    if (CMD_RE.test(t)) out.push(t.replace(/\s+/g, ' '));
  }
  return out;
}
function countOf(text, sub) { if (!sub) return 0; return text.split(sub).length - 1; }
function mdLinks(text) {
  const out = [];
  const re = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

check('docs.pairs', () => {
  const c = cfg();
  const p = pkg();
  must(c.docs.pairs.length > 0, 'docs.pairs 为空，至少要声明 README 双语对', '加 "pairs": [["README.md","README.en.md"]]');
  const problems = [];
  for (const pair of c.docs.pairs) {
    const a = pair[0];
    const b = pair[1];
    if (!has(a) || !has(b)) { problems.push(a + ' / ' + b + ' 缺失'); continue; }
    const ta = read(a);
    const tb = read(b);
    const ha = headingLines(ta).length;
    const hb = headingLines(tb).length;
    if (ha !== hb) problems.push(a + ' 有 ' + ha + ' 个标题，' + b + ' 有 ' + hb + ' 个（标题层级必须一一对应）');
    const ca = codeCommands(ta);
    const cb = codeCommands(tb);
    if (ca.join('\n') !== cb.join('\n')) {
      const extraA = ca.filter((x) => cb.indexOf(x) < 0).slice(0, 3);
      const extraB = cb.filter((x) => ca.indexOf(x) < 0).slice(0, 3);
      problems.push(a + ' / ' + b + ' 代码块命令不一致' + (extraA.length ? '；' + a + ' 独有: ' + extraA.join(' ; ') : '') + (extraB.length ? '；' + b + ' 独有: ' + extraB.join(' ; ') : ''));
    }
    if (countOf(ta, p.version) !== countOf(tb, p.version)) problems.push(a + ' / ' + b + ' 中版本号 ' + p.version + ' 出现次数不一致');
    const dshRange = p.engines && p.engines.dsh;
    if (dshRange && countOf(ta, dshRange) !== countOf(tb, dshRange)) problems.push(a + ' / ' + b + ' 中 engines.dsh 范围出现次数不一致');
  }
  must(problems.length === 0, '双语文档不同步：\n' + problems.map((x) => '    - ' + x).join('\n'), '让两份文档标题数量、代码块命令、版本字符串完全一致（英文版只翻译文字，不改命令）');
  ok(c.docs.pairs.length + ' 对双语文档结构一致');
});

check('docs.links', () => {
  const c = cfg();
  const files = Array.from(new Set(c.docs.required.concat(c.docs.pairs.reduce((a, b) => a.concat(b), []))));
  const bad = [];
  for (const file of files) {
    if (!has(file) || !/\.md$/i.test(file)) continue;
    const text = read(file);
    for (const raw of mdLinks(text)) {
      if (/^(https?:|mailto:|#|data:)/.test(raw)) continue;
      if (raw.charAt(0) === '<' && raw.charAt(raw.length - 1) === '>') continue;
      const target = decodeURIComponent(raw.split('#')[0].split('?')[0]);
      if (!target) continue;
      if (!existsSync(resolve(ROOT, dirname(file), target))) bad.push(file + ' -> ' + raw);
    }
  }
  must(bad.length === 0, '文档里有失效的相对链接： ' + bad.slice(0, 8).join(' | '), '修正链接或补上目标文件');
  ok('相对链接全部可解析');
});

/* --- version ------------------------------------------------------- */

function versionIn(text, version) {
  const re = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/g;
  const m = text.match(re);
  return Boolean(m && m.some((v) => v === version || 'v' + v === version));
}
function compareSemver(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number);
  const pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

check('version.changelog', () => {
  const c = cfg();
  const p = pkg();
  const pair = c.docs.pairs.find((x) => /changelog/i.test(x[0]));
  must(pair, 'docs.pairs 中没有 CHANGELOG 双语对', '加 ["CHANGELOG.md", "CHANGELOG.en.md"]');
  for (const file of pair) {
    must(has(file), '缺少 ' + file, '补 ' + file);
    const text = read(file);
    const h2 = headingLines(text).filter((h) => /^##\s+/.test(h));
    must(h2.length > 0, file + ' 没有任何 "##" 版本标题', '至少写 "## [Unreleased]"');
    const first = h2[0].replace(/^#+\s*/, '');
    must(/unreleased/i.test(first) || versionIn(first, p.version),
      file + ' 的第一个 "##" 标题应为 [Unreleased] 或当前版本 ' + p.version + '，实际是 "' + first + '"',
      '发布前把 [Unreleased] 改成版本号小节');
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex((l) => /^##\s+/.test(l) && versionIn(l, p.version));
    must(idx >= 0, file + ' 缺少 ' + p.version + ' 的版本小节', '加 "## [' + p.version + '] - YYYY-MM-DD"');
    const nextIdx = lines.findIndex((l, j) => j > idx && /^#{1,2}\s+/.test(l));
    const body = lines.slice(idx + 1, nextIdx < 0 ? lines.length : nextIdx).join('').trim();
    must(body.length > 0, file + ' 的 ' + p.version + ' 小节是空的', '写清这一版改了什么');
  }
  ok('CHANGELOG 中英双语都包含 ' + p.version);
});

/* A hand-written product version inside shipped runtime code drifts from
 * package.json silently: dsh-opencode-go-router 0.7.0 shipped with
 * VERSION = '0.6.1' and its status route reported the old number. The gate
 * cannot know every way a plugin names its version, so it checks the shape
 * that has already gone wrong: a top-level product-version constant assigned
 * a semver literal. Reading package.json at runtime is the recommended fix
 * and leaves nothing to drift; independent counters such as MIN_NODE_VERSION
 * or STATE_VERSION are deliberately out of scope. */
const RUNTIME_VERSION_RE = /(?:^|\n)[ \t]*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"\`](\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)['"\`]/g;
const PRODUCT_VERSION_NAMES = new Set(['VERSION', 'PLUGIN_VERSION', 'PACKAGE_VERSION', 'PKG_VERSION']);

/* Blank out comments and template literals so a documented example such as
 * "export const VERSION = '0.9.0'" cannot fail the check, while real string
 * literals (the version value itself) stay readable. */
function maskJsNonCode(src) {
  const out = src.split('');
  const blank = (i) => { const ch = out[i]; if (ch !== undefined && ch !== '\n' && ch !== '\r') out[i] = ' '; };
  let state = 'code';
  let quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (state === 'line') { if (c === '\n') state = 'code'; else blank(i); continue; }
    if (state === 'block') {
      if (c === '*' && n === '/') { blank(i); blank(i + 1); i += 1; state = 'code'; continue; }
      blank(i); continue;
    }
    if (state === 'template') {
      if (c === '\\') { blank(i); blank(i + 1); i += 1; continue; }
      if (c === '`') { blank(i); state = 'code'; continue; }
      blank(i); continue;
    }
    if (state === 'string') {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) { state = 'code'; continue; }
      if (c === '\n') { state = 'code'; continue; }
      continue;
    }
    if (c === '/' && n === '/') { blank(i); blank(i + 1); i += 1; state = 'line'; continue; }
    if (c === '/' && n === '*') { blank(i); blank(i + 1); i += 1; state = 'block'; continue; }
    if (c === '`') { blank(i); state = 'template'; continue; }
    if (c === "'" || c === '"') { state = 'string'; quote = c; continue; }
  }
  return out.join('');
}

check('version.runtime', () => {
  const c = cfg();
  if (!c.manifest) { skip('manifest=null'); return; }
  const p = pkg();
  const files = Array.isArray(p.files) ? p.files : [];
  if (files.length === 0) { skip('package.json 没有 files 白名单'); return; }
  const targets = [];
  for (const entry of files) {
    const rel = String(entry).replace(/^\.\//, '').replace(/\/$/, '');
    if (!rel) continue;
    if (hasGlob(rel)) { for (const f of expandGlob(rel)) targets.push(f); continue; }
    if (!has(rel)) continue;
    if (isDir(rel)) walk(rel, targets);
    else targets.push(rel);
  }
  const bad = [];
  for (const file of targets) {
    if (!/\.(?:js|mjs|cjs|ts|tsx)$/.test(file) || /\.min\.js$/.test(file)) continue;
    const text = maskJsNonCode(read(file));
    RUNTIME_VERSION_RE.lastIndex = 0;
    let m;
    while ((m = RUNTIME_VERSION_RE.exec(text))) {
      if (!PRODUCT_VERSION_NAMES.has(m[1])) continue;
      if (m[2] !== p.version) bad.push(file + ': ' + m[1] + " = '" + m[2] + "', package.json = " + p.version);
    }
  }
  must(bad.length === 0,
    '运行时代码手写的版本常量与 package.json 不一致：' + bad.slice(0, 5).join(' | '),
    '改成运行时读取 package.json：import { createRequire } from "node:module"; const pkg = createRequire(import.meta.url)("../package.json"); export const VERSION = pkg.version。发版只改 package.json，状态路由与界面随之更新');
  ok('运行时版本常量与 package.json 一致');
});

/* --- hygiene ------------------------------------------------------- */

check('repo.hygiene', () => {
  const tracked = String(git(['ls-files', '-z']).stdout).split('\0').filter(Boolean);
  const bad = tracked.filter((f) =>
    /(^|\/)node_modules\//.test(f) ||
    /(^|\/)\.env(\.|$)/.test(f) ||
    /\.tgz$/.test(f) ||
    /\.log$/.test(f) ||
    /(^|\/)\.npm-cache\//.test(f));
  must(bad.length === 0, '仓库提交了不应入库的文件: ' + bad.slice(0, 6).join(', '), 'git rm --cached <file> 并写进 .gitignore');
  must(has('.gitattributes'), '缺少 .gitattributes', '加一行 "* text=auto eol=lf"');
  const ga = read('.gitattributes');
  must(/^\*\s+text=auto/m.test(ga), '.gitattributes 缺少 "* text=auto"', '补一行 "* text=auto eol=lf"');
  const big = tracked.filter((f) => { try { return statSync(join(ROOT, f)).size > 5 * 1024 * 1024; } catch (e) { return false; } });
  if (big.length > 0) warn('仓库里有 >5 MiB 的文件: ' + big.slice(0, 4).join(', '));
  ok('仓库卫生检查通过');
});

/* ------------------------------------------------------------------ */
/* Release checks                                                      */
/* ------------------------------------------------------------------ */

function tagName() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  const ref = process.env.GITHUB_REF || '';
  return ref.indexOf('refs/tags/') === 0 ? ref.slice(10) : '';
}

check('release.r1-tag-version', () => {
  const p = pkg();
  const tag = tagName();
  must(tag.length > 0, 'release 检查需要 tag 环境（GITHUB_REF_NAME），不能在本地无 tag 运行', '只在 release.yml 的 tag 触发里运行');
  must(tag === 'v' + p.version, 'tag ' + tag + ' 与 package.json version ' + p.version + ' 不一致', '改版本号，或删除 tag 后重打 v' + p.version);
  ok('tag ' + tag + ' == v' + p.version);
}, ['release']);

check('release.r2-ancestor', () => {
  const p = pkg();
  const bases = ['origin/main', 'main'].filter((ref) => git(['rev-parse', '--verify', '--quiet', ref], true).status === 0);
  must(bases.length > 0, '找不到 main / origin/main，无法确认 tag 在主线', 'checkout 时使用 fetch-depth: 0');
  const tag = 'v' + p.version;
  const exists = git(['rev-parse', '--verify', '--quiet', 'refs/tags/' + tag], true).status === 0;
  const rev = exists ? tag : 'HEAD';
  const r = git(['merge-base', '--is-ancestor', rev, bases[0]], true);
  must(r.status === 0, 'tag ' + tag + ' 指向的提交不在 ' + bases[0] + ' 上（禁止从分支直接发版）', '把提交合并进 main 之后，在 main 的提交上重新打 tag');
  ok('tag 是 ' + bases[0] + ' 的祖先');
}, ['release']);

function dirtyLines() {
  return String(git(['status', '--porcelain']).stdout).split(/\r?\n/).filter((line) => {
    if (!line) return false;
    const path = line.slice(3).trim();
    return !(path === '.ci' || path.indexOf('.ci/') === 0);
  });
}

check('release.r3-clean-tree', () => {
  const c = cfg();
  must(dirtyLines().length === 0, '发布工作区不干净（有未提交改动）: ' + dirtyLines().slice(0, 4).join(' | '), '提交或还原改动后再发版');
  if (c.build) {
    const r = sh(c.build.command);
    must(r.code === 0, '发布前构建失败: ' + tail(r.out, 12), '修好构建');
    const st = String(git(['status', '--porcelain', '--untracked-files=all', '--'].concat(c.build.artifacts)).stdout).trim();
    must(!st, '发布前构建产物不新鲜: ' + st.split(/\r?\n/).slice(0, 4).join(' | '), '提交构建产物后重新打 tag');
  }
  ok('发布树干净且产物新鲜');
}, ['release']);

check('release.r4-notes', () => {
  const c = cfg();
  const p = pkg();
  const pair = c.docs.pairs.find((x) => /changelog/i.test(x[0]));
  must(pair, 'docs.pairs 中没有 CHANGELOG 双语对', '加 ["CHANGELOG.md","CHANGELOG.en.md"]');
  for (const file of pair) {
    must(has(file), '缺少 ' + file, '补 ' + file);
    must(versionIn(read(file), p.version), file + ' 里没有 ' + p.version + ' 的发布说明', '发布前在 CHANGELOG 写上这一版');
  }
  ok('中英 CHANGELOG 都有 ' + p.version + ' 小节');
}, ['release']);

function envPositiveInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function waitForRegistry(name, version, attempts, delayMs) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await registryVersion(name, version);
    if (last.status === 200) return last;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}

async function registryVersion(name, version) {
  const base = (process.env.DSH_CI_REGISTRY_URL || 'https://registry.npmjs.org').replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(base + '/' + name + '/' + version, {
      headers: { 'user-agent': 'dsh-plugin-ci' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new GateError('无法访问 registry (' + base + '): ' + e.message, '检查网络；发布检查必须联网');
  }
  let json = null;
  if (res.status === 200) { try { json = await res.json(); } catch (e) { json = null; } }
  return { status: res.status, json };
}

check('release.r5-unpublished', async () => {
  const c = cfg();
  if (!c.release.publish) { skip('release.publish=false，不需要检查 npm 占用'); return; }
  const p = pkg();
  const r = await registryVersion(p.name, p.version);
  must(r.status === 404, 'npm 上已存在 ' + p.name + '@' + p.version + '（registry 返回 ' + r.status + '），禁止覆盖发布', '提高版本号后重新走发布流程');
  ok(p.name + '@' + p.version + ' 尚未发布');
}, ['release']);

check('release.r6-verify', () => {
  const bad = results.filter((r) => r.status === 'fail' && r.id.indexOf('release.') !== 0);
  must(bad.length === 0, 'verify 未全绿，禁止发布: ' + bad.map((r) => r.id).join(', '), '先修好 verify 的失败项再发布');
  ok('verify 全绿');
}, ['release']);

check('release.r7-post', async () => {
  const c = cfg();
  if (!c.release.publish) { skip('release.publish=false'); return; }
  const p = pkg();
  const expected = process.env.DSH_CI_EXPECTED_SHA || process.env.GITHUB_SHA || '';
  must(expected.length > 0, '缺少 DSH_CI_EXPECTED_SHA / GITHUB_SHA，无法核对发布提交', '在 GitHub Actions 中运行 --after-publish');
  const attempts = envPositiveInt('DSH_CI_REGISTRY_ATTEMPTS', 120);
  const delayMs = envPositiveInt('DSH_CI_REGISTRY_DELAY_MS', 5000);
  const waitSec = Math.round((attempts * delayMs) / 1000);
  const r = await waitForRegistry(p.name, p.version, attempts, delayMs);
  must(r.status === 200, 'registry 上还没有 ' + p.name + '@' + p.version + '（等待约 ' + waitSec + ' 秒后仍返回 ' + r.status + '）', '检查 npm publish 是否失败；如果只是 registry 传播慢，设置 DSH_CI_REGISTRY_ATTEMPTS 后重跑 --after-publish');
  const j = r.json || {};
  must(j.gitHead === expected, 'registry gitHead (' + String(j.gitHead) + ') 与期望的发布提交 (' + expected + ') 不一致', '确认 tag 指向的提交就是发布提交；恢复流程通过 DSH_CI_EXPECTED_SHA 传入 tag 提交');
  must(j.dist && typeof j.dist.integrity === 'string' && j.dist.integrity.length > 0, 'registry 缺少 dist.integrity', '检查发布是否完整');
  if (c.release.provenance) {
    const att = j.dist && j.dist.attestations;
    must(Boolean(att && att.provenance), 'registry 上没有 provenance 证明', 'release.yml 需要 permissions.id-token: write，且 npm publish --provenance');
  }
  ok(p.name + '@' + p.version + ' 已发布，gitHead 与附件完整');
}, ['after']);

check('prepublish.local-guard', () => {
  const p = pkg();
  const tag = tagName();
  const inCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  must(inCI && tag === 'v' + p.version,
    '本机禁止 npm publish：发布必须由 GitHub Actions 的 release 工作流完成（打 tag v' + p.version + ' 并推送）',
    '把改动合并进 main 后执行: git tag v' + p.version + ' && git push origin v' + p.version);
  ok('CI tag 环境校验通过');
}, ['prepublish']);

/* ------------------------------------------------------------------ */
/* PR guard                                                            */
/* ------------------------------------------------------------------ */

let EV = null;
let DIFF = null;
function event() {
  if (EV) return EV;
  const path = process.env.GITHUB_EVENT_PATH;
  must(path && existsSync(path), 'pr-guard 只能在 GitHub Actions 的 pull_request 事件里运行（缺少 GITHUB_EVENT_PATH）', '由 .github/workflows/ci.yml 的 pr-guard job 触发');
  EV = JSON.parse(readFileSync(path, 'utf8'));
  must(EV.pull_request, '事件不是 pull_request', '检查工作流触发器');
  return EV;
}
function pr() { return event().pull_request; }
function diffFiles() {
  if (DIFF) return DIFF;
  const e = event();
  const base = e.pull_request.base.sha;
  const head = e.pull_request.head.sha;
  git(['fetch', '--no-tags', '--quiet', 'origin', base], true);
  const r = git(['diff', '--no-color', '--unified=0', '--find-renames', base, head], true);
  must(r.status === 0, '无法计算 PR diff: ' + tail(r.stderr, 6), 'checkout 需要 fetch-depth: 0');
  const files = [];
  let cur = null;
  for (const line of String(r.stdout).split('\n')) {
    if (line.indexOf('diff --git ') === 0) {
      cur = { path: '', added: [], isNew: false, addedCount: 0, removedCount: 0 };
      files.push(cur);
    } else if (cur && line.indexOf('+++ ') === 0) {
      const raw = line.slice(4).trim();
      cur.path = raw === '/dev/null' ? '' : raw.replace(/^b\//, '').replace(/^"(.+)"$/, '$1');
      cur.isNew = raw === '/dev/null';
    } else if (cur && line.indexOf('+') === 0 && line.indexOf('+++') !== 0) {
      cur.added.push(line.slice(1));
      cur.addedCount++;
    } else if (cur && line.indexOf('-') === 0 && line.indexOf('---') !== 0) {
      cur.removedCount++;
    }
  }
  DIFF = files.filter((f) => f.path);
  return DIFF;
}
let LIVE_LABELS = null;
let LIVE_BODY = null;
let LIVE_PR_ERROR = null;

/**
 * 标签与 PR 描述以运行时的 API 结果为准，而不是触发事件里的快照。
 *
 * 原因：标签门（g5/g9）与清单门（g1）要在"事后加标签/改描述"时由同一个 run 重跑
 * 后通过，而重跑沿用原始事件 payload。读实时状态后，重跑能看到当前的标签与描述，
 * 同一个 SHA 上只需要一套 check run。
 * 在 CI（有 token 与 repo）里读不到实时状态时失败，而不是退回旧快照：旧快照可能
 * 还带着已被撤销的 human-approved，回退等于让撤销的批准继续放行。
 * 本地运行（无 token/repo）或用 DSH_CI_PR_LABELS / DSH_CI_PR_BODY 覆盖时仍用快照。
 */
async function loadLivePr() {
  if (OPTS.mode !== 'guard') return;
  const labelOverride = process.env.DSH_CI_PR_LABELS;
  const bodyOverride = process.env.DSH_CI_PR_BODY;
  if (labelOverride !== undefined || bodyOverride !== undefined) {
    if (labelOverride !== undefined) LIVE_LABELS = labelOverride.split(',').map((s) => s.trim()).filter(Boolean);
    if (bodyOverride !== undefined) LIVE_BODY = bodyOverride;
    return;
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;
  const api = (process.env.DSH_CI_PR_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  try {
    const number = pr().number;
    if (!number) return;
    const res = await fetch(api + '/repos/' + repo + '/pulls/' + number, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dsh-ci-gate',
      },
    });
    if (!res.ok) {
      LIVE_PR_ERROR = 'GitHub API 返回 ' + res.status;
      return;
    }
    const j = await res.json();
    if (!Array.isArray(j.labels)) {
      LIVE_PR_ERROR = 'GitHub API 响应里没有 labels';
      return;
    }
    LIVE_LABELS = j.labels.map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
    if (typeof j.body === 'string') LIVE_BODY = j.body;
  } catch (e) {
    LIVE_PR_ERROR = e && e.message ? e.message : String(e);
    if (process.env.CI_GATE_DEBUG) console.error(e);
  }
}

function assertLivePr() {
  if (!LIVE_PR_ERROR) return;
  throw new GateError('无法通过 GitHub API 读取 PR 当前状态（' + LIVE_PR_ERROR + '），拒绝用事件快照里的旧标签/旧描述判定',
    '确认 workflow 给 GITHUB_TOKEN 留了 pull-requests: read，且 GitHub API 可用；恢复后重跑，不要退回旧快照放行');
}

function labelNames() {
  assertLivePr();
  if (LIVE_LABELS) return LIVE_LABELS;
  return (pr().labels || []).map((l) => (typeof l === 'string' ? l : l.name));
}

function prBody() {
  assertLivePr();
  return LIVE_BODY !== null ? LIVE_BODY : (pr().body || '');
}

check('guard.g1-checklist', () => {
  const body = prBody();
  const tplPath = '.github/PULL_REQUEST_TEMPLATE.md';
  must(has(tplPath), '缺少 PR 模板 ' + tplPath, '从 canonical 的 templates/PULL_REQUEST_TEMPLATE.md 复制');
  const items = read(tplPath).split(/\r?\n/)
    .filter((l) => /^\s*-\s*\[ \]/.test(l))
    .map((l) => l.replace(/^\s*-\s*\[ \]\s*/, '').trim());
  must(items.length > 0, 'PR 模板里没有必勾项', '模板至少保留 3 个 "- [ ]" 项');
  const missing = items.filter((t) => {
    const key = t.slice(0, 40);
    return !new RegExp('-\\s*\\[x\\]\\s*' + escRe(key), 'i').test(body);
  });
  must(missing.length === 0, 'PR 描述没有勾选必选项（共 ' + items.length + ' 项，缺 ' + missing.length + '）: ' + missing.slice(0, 3).join(' | '), '按模板逐项确认后改成 [x]；不要删模板项');
  ok('PR 清单已全部勾选');
}, ['guard']);

check('guard.g2-branch', () => {
  const head = pr().head.ref;
  must(/^(feat|fix|chore|docs|refactor|test|release)\/[a-z0-9._-]+$/.test(head), '分支名不合规: ' + head, 'rename: feat/<slug> | fix/<slug> | chore/<slug> | docs/<slug> | refactor/<slug> | test/<slug> | release/<version>');
  ok('分支名 ' + head);
}, ['guard']);

check('guard.g3-focus-tests', () => {
  const bad = [];
  for (const f of diffFiles()) {
    if (!/\.(mjs|js|cjs|ts|tsx|jsx)$/.test(f.path)) continue;
    for (const line of f.added) {
      if (/\b(test|it|describe|suite|context)\.(only|skip)\s*\(/.test(line) || /\bxit\s*\(|\bxdescribe\s*\(/.test(line)) bad.push(f.path + ': ' + line.trim().slice(0, 80));
    }
  }
  must(bad.length === 0, 'PR 里新增了 .only / .skip / xit: ' + bad.slice(0, 3).join(' | '), '删掉这些标记，CI 必须跑全部测试');
  ok('没有新增 .only / .skip');
}, ['guard']);

check('guard.g4-suppressions', () => {
  const bad = [];
  for (const f of diffFiles()) {
    if (/\.(md|txt)$/.test(f.path)) continue;
    for (const line of f.added) {
      if (/@ts-nocheck|@ts-ignore|@ts-expect-error|eslint-disable|prettier-ignore/.test(line)) bad.push(f.path + ': ' + line.trim().slice(0, 80));
    }
  }
  must(bad.length === 0, 'PR 里新增了类型/规范压制: ' + bad.slice(0, 3).join(' | '), '修好根因；确需压制请在 PR 里说明并让维护者加 ci-change 标签');
  ok('没有新增压制注释');
}, ['guard']);

check('guard.g5-sensitive', () => {
  const selfHosted = cfg().selfHosted;
  const sensitive = diffFiles().filter((f) =>
    /^\.github\/workflows\//.test(f.path) ||
    f.path === 'ci.config.json' ||
    f.path === 'AGENTS.md' ||
    f.path === '.github/PULL_REQUEST_TEMPLATE.md' ||
    (selfHosted && /^(scripts|schema|rulesets|templates)\//.test(f.path)));
  if (sensitive.length === 0) { ok('未触碰敏感文件'); return; }
  must(labelNames().indexOf('ci-change') >= 0, 'PR 修改了 CI 敏感文件，但没有 ci-change 标签（须由维护者确认后添加）: ' + sensitive.map((f) => f.path).join(', '), '请维护者 review 后给 PR 加 ci-change 标签再合并');
  ok('敏感文件改动已由维护者加 ci-change 标签');
}, ['guard']);

check('guard.g6-forbidden-files', () => {
  const bad = diffFiles().filter((f) => f.isNew && (/\.tgz$/.test(f.path) || /^node_modules\//.test(f.path) || /(^|\/)\.env(\.|$)/.test(f.path) || /\.log$/.test(f.path)));
  must(bad.length === 0, 'PR 新增了禁止入库的文件: ' + bad.map((f) => f.path).join(', '), '删掉这些文件并写进 .gitignore');
  ok('没有新增禁止入库的文件');
}, ['guard']);

function gitShowJSON(rev, file) {
  const r = git(['show', rev + ':' + file], true);
  if (r.status !== 0) return null;
  try { return JSON.parse(String(r.stdout)); } catch (e) { return null; }
}

check('guard.g7-version-bump', () => {
  const p = pkg();
  const base = event().pull_request.base.sha;
  const branch = pr().head.ref;
  const basePkg = gitShowJSON(base, 'package.json');
  const baseVersion = basePkg && basePkg.version;
  if (!baseVersion || baseVersion === p.version) { ok('版本号未改动'); return; }
  must(branch.indexOf('release/') === 0, '版本号只能在 release/<version> 分支上修改（' + baseVersion + ' -> ' + p.version + '）', '把版本改动移到 release/' + p.version + ' 分支');
  must(compareSemver(p.version, baseVersion) > 0, '版本号必须大于 main 上的 ' + baseVersion + '，实际 ' + p.version, '提高版本号');
  const touched = diffFiles().some((f) => /changelog/i.test(f.path));
  must(touched, '改了版本号但没有更新 CHANGELOG', '在 CHANGELOG.md 和 CHANGELOG.en.md 写上 ' + p.version + ' 小节');
  ok('版本 ' + baseVersion + ' -> ' + p.version + ' 在 release 分支上');
}, ['guard']);

check('guard.g8-diff-size', () => {
  const files = diffFiles();
  const lockRe = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
  let lines = 0;
  for (const f of files) if (!lockRe.test(f.path)) lines += f.addedCount + f.removedCount;
  if (files.length > 60) warn('PR 改动 ' + files.length + ' 个文件（>60），请确认不是生成物或批量改写');
  if (lines > 1200) warn('PR 改动 ' + lines + ' 行（>1200，不含 lockfile），请拆分或说明');
  if (files.length <= 60 && lines <= 1200) ok('diff 规模正常（' + files.length + ' 文件 / ' + lines + ' 行）');
}, ['guard']);

check('guard.g9-human-approved', () => {
  const c = cfg();
  if (!c.guards.requireHumanApprovedLabel) { skip('本仓不要求 human-approved 标签'); return; }
  must(labelNames().indexOf('human-approved') >= 0, 'PR 缺少 human-approved 标签（模型只能提交，必须由人放行）', '请维护者 review 后添加 human-approved 标签；模型不得自己加');
  ok('已有人类放行标签');
}, ['guard']);

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

function printResults() {
  if (OPTS.json) {
    console.log(JSON.stringify({ mode: OPTS.mode, results, ok: results.every((r) => r.status !== 'fail') }, null, 2));
    return;
  }
  for (const r of results) {
    const mark = r.status === 'ok' ? paint('32', '✓') : r.status === 'fail' ? paint('31', '✗') : r.status === 'warn' ? paint('33', '!') : paint('2', '·');
    console.log(mark + '  ' + r.id + '  ' + r.msg);
    if (r.status === 'fail' && r.fix) console.log('   fix: ' + r.fix);
  }
  const n = (s) => results.filter((r) => r.status === s).length;
  const verdict = n('fail') === 0 ? paint('32', 'PASS') : paint('31', 'FAIL');
  console.log('');
  console.log(verdict + '  ' + n('ok') + ' ok, ' + n('warn') + ' warn, ' + n('fail') + ' fail, ' + n('skip') + ' skip  [' + OPTS.mode + ']');
}

function summaryMarkdown() {
  const lines = ['## ci-gate (' + OPTS.mode + ')', '', '| 结果 | 检查 | 说明 |', '| --- | --- | --- |'];
  const icon = { ok: '✅', fail: '❌', warn: '⚠️', skip: '⏭️' };
  for (const r of results) {
    lines.push('| ' + (icon[r.status] || r.status) + ' | ' + r.id + ' | ' + String(r.msg).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ') + ' |');
  }
  if (results.some((r) => r.status === 'fail')) {
    lines.push('', '### 怎么修');
    for (const r of results.filter((x) => x.status === 'fail')) lines.push('- **' + r.id + '**: ' + r.fix);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  if (OPTS.help) {
    console.log('用法: node .ci/scripts/ci-gate.mjs [--only=a,b] [--skip=c] [--json] [--release|--after-publish|--prepublish|--pr]');
    return;
  }
  await loadLivePr();
  for (const c of checks) {
    if (c.modes.indexOf(OPTS.mode) < 0) continue;
    if (!selected(c.id)) continue;
    CURRENT_ID = c.id;
    try {
      await c.fn();
    } catch (e) {
      if (e instanceof GateError) { fail(c.id, e.message, e.fix); continue; }
      INTERNAL++;
      fail(c.id, '检查内部错误: ' + (e && e.message ? e.message : String(e)), '这是 gate 的 bug，请报告到 dsh-plugin-ci');
      if (process.env.CI_GATE_DEBUG) console.error(e);
    }
  }
  if (results.length === 0) fail('gate.selector', '没有匹配的检查项（--only/--skip 写错？）', 'node scripts/ci-gate.mjs --only=config.schema');
  printResults();
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown()); } catch (e) { /* ignore */ }
  }
  process.exitCode = INTERNAL > 0 ? 2 : results.some((r) => r.status === 'fail') ? 1 : 0;
}

main().catch((e) => {
  console.error('ci-gate 内部错误: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(2);
});
