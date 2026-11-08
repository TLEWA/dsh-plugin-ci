import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, '..', 'scripts', 'ci-gate.mjs');
const FENCE = String.fromCharCode(96, 96, 96);

const PATCH = "- insert:\n    - id: demo\n      name: '@tlewa/demo'\n";
const CHANGELOG_ZH = '# 更新日志\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### 新增\n\n- init\n';
const CHANGELOG_EN = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- init\n';
const README_ZH = '# Demo\n\n## 安装\n\nnpm install @tlewa/demo\n';
const README_EN = '# Demo\n\n## Install\n\nnpm install @tlewa/demo\n';
const PR_TEMPLATE = '## 自检\n\n- [ ] 我读过流程\n- [ ] 本地 gate 全绿\n- [ ] 有测试\n';

function basePackage() {
  return {
    name: '@tlewa/demo',
    version: '1.0.0',
    type: 'module',
    files: ['lib', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'LICENSE'],
    engines: { dsh: '>=0.2.1-rc.5 <0.3.0-0', node: '>=20' },
    dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } },
    exports: { '.': './lib/index.js' },
  };
}

function baseConfig() {
  return {
    version: 1,
    install: 'none',
    build: null,
    typecheck: null,
    test: null,
    testGlobs: ['test/**/*.test.mjs'],
    manifest: { manifestVersion: 1, requireEnginesNode: true, allowedInject: [] },
    docs: {
      pairs: [['README.md', 'README.en.md'], ['CHANGELOG.md', 'CHANGELOG.en.md']],
      required: ['README.md', 'README.en.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'LICENSE'],
      published: [],
    },
    tarball: null,
    release: { publish: false, provenance: false, assetAlias: '' },
    guards: { requireHumanApprovedLabel: false },
    gate: { allowUnstamped: true },
  };
}

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + String(r.stderr || ''));
  return String(r.stdout || '').trim();
}

function commitAll(dir, msg) {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=gate@test', '-c', 'user.name=gate', 'commit', '-q', '-m', msg || 'change']);
  return git(dir, ['rev-parse', 'HEAD']);
}

function makeRepo(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'dpc-'));
  const files = {
    'package.json': '',
    'ci.config.json': '',
    'cordis.patch.yml': PATCH,
    'lib/index.js': 'export const value = 1;\n',
    'README.md': README_ZH,
    'README.en.md': README_EN,
    'CHANGELOG.md': CHANGELOG_ZH,
    'CHANGELOG.en.md': CHANGELOG_EN,
    'LICENSE': 'MIT\n',
    '.gitattributes': '* text=auto eol=lf\n',
    '.github/PULL_REQUEST_TEMPLATE.md': PR_TEMPLATE,
  };
  const pkg = basePackage();
  const cfg = baseConfig();
  if (mutate) mutate({ files, pkg, cfg, dir });
  files['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
  files['ci.config.json'] = JSON.stringify(cfg, null, 2) + '\n';
  for (const rel of Object.keys(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, files[rel]);
  }
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(GATE, join(dir, 'scripts', 'ci-gate.mjs'));
  copyFileSync(join(HERE, '..', 'scripts', 'sync-ci.mjs'), join(dir, 'scripts', 'sync-ci.mjs'));
  git(dir, ['init', '-q', '-b', 'main']);
  commitAll(dir, 'init');
  return dir;
}

function cleanEnv() {
  const env = Object.assign({}, process.env);
  for (const k of ['GITHUB_REF', 'GITHUB_REF_NAME', 'GITHUB_SHA', 'GITHUB_EVENT_PATH', 'GITHUB_REPOSITORY', 'GITHUB_ACTIONS', 'CI']) {
    delete env[k];
  }
  env.NO_COLOR = '1';
  return env;
}

function runGate(dir, args, env) {
  const r = spawnSync(process.execPath, ['scripts/ci-gate.mjs'].concat(args || []), {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180000,
    env: Object.assign(cleanEnv(), env || {}),
  });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

function writeEvent(dir, ev) {
  const file = join(dir, '.gate-event.json');
  writeFileSync(file, JSON.stringify({ pull_request: ev }));
  return file;
}

function fenced(cmd) {
  return '# Demo\n\n' + FENCE + 'bash\n' + cmd + '\n' + FENCE + '\n';
}

test('verify passes on a compliant fixture', () => {
  const dir = makeRepo();
  const r = runGate(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PASS/);
  assert.match(r.out, /manifest\.bundle/);
});

test('config.schema rejects an unknown key', () => {
  const dir = makeRepo(({ cfg }) => { cfg.extra = true; });
  const r = runGate(dir, ['--only=config.schema']);
  assert.equal(r.code, 1);
  assert.match(r.out, /未知键/);
});

test('config.schema rejects a missing key', () => {
  const dir = makeRepo(({ cfg }) => { delete cfg.tarball; });
  const r = runGate(dir, ['--only=config.schema']);
  assert.equal(r.code, 1);
  assert.match(r.out, /缺失/);
});

test('manifest.engines requires top-level engines.dsh', () => {
  const dir = makeRepo(({ pkg }) => { delete pkg.engines.dsh; });
  const r = runGate(dir, ['--only=manifest.engines']);
  assert.equal(r.code, 1);
  assert.match(r.out, /engines\.dsh/);
});

test('manifest.engines requires dsh.manifestVersion', () => {
  const dir = makeRepo(({ pkg }) => { delete pkg.dsh.manifestVersion; });
  const r = runGate(dir, ['--only=manifest.engines']);
  assert.equal(r.code, 1);
  assert.match(r.out, /manifestVersion/);
});

test('manifest.bundle requires the insert name to equal the package name', () => {
  const dir = makeRepo(({ files }) => {
    files['cordis.patch.yml'] = PATCH.replace('@tlewa/demo', '@tlewa/other');
  });
  const r = runGate(dir, ['--only=manifest.bundle']);
  assert.equal(r.code, 1);
  assert.match(r.out, /insert name/);
});

test('manifest.bundle rejects a missing patch file', () => {
  const dir = makeRepo(({ files, pkg }) => {
    delete files['cordis.patch.yml'];
    pkg.dsh.bundle.patch = './missing.patch.yml';
  });
  const r = runGate(dir, ['--only=manifest.bundle']);
  assert.equal(r.code, 1);
  assert.match(r.out, /不存在|缺失/);
});

test('manifest.exports rejects bare inject modules', () => {
  const dir = makeRepo(({ files, pkg }) => {
    files['lib/client.js'] = 'export {};\n';
    pkg.dsh.client = { inject: ['react'] };
    pkg.exports['./client'] = './lib/client.js';
  });
  const r = runGate(dir, ['--only=manifest.exports']);
  assert.equal(r.code, 1);
  assert.match(r.out, /未授权模块/);
});

test('docs.pairs rejects divergent commands', () => {
  const dir = makeRepo(({ files }) => {
    files['README.md'] = fenced('npm install @tlewa/demo');
    files['README.en.md'] = fenced('npm install @tlewa/demo@latest');
  });
  const r = runGate(dir, ['--only=docs.pairs']);
  assert.equal(r.code, 1);
  assert.match(r.out, /命令不一致/);
});

test('docs.links rejects a dead relative link', () => {
  const dir = makeRepo(({ files }) => {
    files['README.md'] = README_ZH + '\n[missing](./nope.md)\n';
  });
  const r = runGate(dir, ['--only=docs.links']);
  assert.equal(r.code, 1);
  assert.match(r.out, /失效/);
});

test('files.present rejects a missing files entry', () => {
  const dir = makeRepo(({ pkg }) => { pkg.files.push('does-not-exist'); });
  const r = runGate(dir, ['--only=files.present']);
  assert.equal(r.code, 1);
  assert.match(r.out, /files 条目/);
});

test('tarball.contents rejects files that must be excluded', () => {
  const dir = makeRepo(({ files, pkg, cfg }) => {
    files['src/a.js'] = 'export {};\n';
    pkg.files.push('src');
    cfg.tarball = { mustInclude: ['lib/index.js'], mustExclude: ['src/**'], maxBytes: 1048576 };
  });
  const r = runGate(dir, ['--only=tarball.contents']);
  assert.equal(r.code, 1);
  assert.match(r.out, /禁止文件/);
});

test('artifacts.fresh rejects stale build output', () => {
  const dir = makeRepo(({ cfg }) => {
    cfg.build = {
      command: 'node -e "require(\'fs\').writeFileSync(\'lib/index.js\',\'export const value = 2;\')"',
      artifacts: ['lib'],
      mode: 'git-diff',
    };
  });
  const r = runGate(dir, ['--only=artifacts.fresh']);
  assert.equal(r.code, 1);
  assert.match(r.out, /不新鲜/);
});

test('repo.hygiene rejects a tracked tarball', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'pkg.tgz'), 'x');
  commitAll(dir, 'add tgz');
  const r = runGate(dir, ['--only=repo.hygiene']);
  assert.equal(r.code, 1);
  assert.match(r.out, /不应入库/);
});

test('stamp.self rejects a tampered gate record', () => {
  const dir = makeRepo(({ files, cfg }) => {
    cfg.gate.allowUnstamped = false;
    files['scripts/ci-process.json'] = JSON.stringify({ gateVersion: 1, sha256: 'deadbeef' }) + '\n';
  });
  const r = runGate(dir, ['--only=stamp.self']);
  assert.equal(r.code, 1);
  assert.match(r.out, /sha256/);
});

test('version.changelog rejects a wrong first heading', () => {
  const dir = makeRepo(({ files }) => {
    files['CHANGELOG.md'] = '# 更新日志\n\n## [0.9.0] - 2026-01-01\n\n### 新增\n\n- old\n';
  });
  const r = runGate(dir, ['--only=version.changelog']);
  assert.equal(r.code, 1);
  assert.match(r.out, /第一个/);
});

test('release.r1 rejects a tag that differs from the version', () => {
  const dir = makeRepo();
  const r = runGate(dir, ['--release', '--only=release.r1-tag-version'], { GITHUB_REF_NAME: 'v9.9.9' });
  assert.equal(r.code, 1);
  assert.match(r.out, /不一致/);
});

test('release.r2 rejects a tag outside main', () => {
  const dir = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'side']);
  writeFileSync(join(dir, 'side.txt'), 'x');
  commitAll(dir, 'side work');
  const side = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['tag', 'v1.0.0', side]);
  git(dir, ['checkout', '-q', 'main']);
  const r = runGate(dir, ['--release', '--only=release.r2-ancestor'], { GITHUB_REF_NAME: 'v1.0.0' });
  assert.equal(r.code, 1);
  assert.match(r.out, /不在/);
});

test('guard.g1 requires the PR checklist to be ticked', () => {
  const dir = makeRepo();
  const head = git(dir, ['rev-parse', 'HEAD']);
  const path = writeEvent(dir, { base: { sha: head }, head: { sha: head, ref: 'feat/x' }, body: '', labels: [] });
  const r = runGate(dir, ['--pr', '--only=guard.g1-checklist'], { GITHUB_EVENT_PATH: path });
  assert.equal(r.code, 1);
  assert.match(r.out, /必选项/);
});

test('guard.g2 rejects non-conventional branch names', () => {
  const dir = makeRepo();
  const head = git(dir, ['rev-parse', 'HEAD']);
  const path = writeEvent(dir, { base: { sha: head }, head: { sha: head, ref: 'my-branch' }, body: '', labels: [] });
  const r = runGate(dir, ['--pr', '--only=guard.g2-branch'], { GITHUB_EVENT_PATH: path });
  assert.equal(r.code, 1);
  assert.match(r.out, /分支名/);
});

test('guard.g3 rejects a new focus marker', () => {
  const dir = makeRepo();
  const base = git(dir, ['rev-parse', 'HEAD']);
  mkdirSync(join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'test', 'a.test.mjs'), "test.only('x', () => {});\n");
  const head = commitAll(dir, 'focus');
  const path = writeEvent(dir, { base: { sha: base }, head: { sha: head, ref: 'feat/focus' }, body: '', labels: [] });
  const r = runGate(dir, ['--pr', '--only=guard.g3-focus-tests'], { GITHUB_EVENT_PATH: path });
  assert.equal(r.code, 1);
  assert.ok(r.out.includes('.only'));
});

test('guard.g5 requires the ci-change label and accepts it when present', () => {
  const dir = makeRepo();
  const base = git(dir, ['rev-parse', 'HEAD']);
  const cfg = JSON.parse(readFileSync(join(dir, 'ci.config.json'), 'utf8'));
  cfg.testGlobs.push('test/**/*.spec.mjs');
  writeFileSync(join(dir, 'ci.config.json'), JSON.stringify(cfg, null, 2) + '\n');
  const head = commitAll(dir, 'touch ci config');
  const ref = 'chore/ci';
  const noLabel = writeEvent(dir, { base: { sha: base }, head: { sha: head, ref }, body: '', labels: [] });
  const first = runGate(dir, ['--pr', '--only=guard.g5-sensitive'], { GITHUB_EVENT_PATH: noLabel });
  assert.equal(first.code, 1);
  assert.match(first.out, /ci-change/);
  const withLabel = writeEvent(dir, { base: { sha: base }, head: { sha: head, ref }, body: '', labels: [{ name: 'ci-change' }] });
  const second = runGate(dir, ['--pr', '--only=guard.g5-sensitive'], { GITHUB_EVENT_PATH: withLabel });
  assert.equal(second.code, 0, second.out);
});

test('guard.g7 restricts version bumps to release branches', () => {
  const dir = makeRepo();
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'feat/bump']);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  pkg.version = '1.0.1';
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const head = commitAll(dir, 'bump version');
  const path = writeEvent(dir, { base: { sha: base }, head: { sha: head, ref: 'feat/bump' }, body: '', labels: [] });
  const r = runGate(dir, ['--pr', '--only=guard.g7-version-bump'], { GITHUB_EVENT_PATH: path });
  assert.equal(r.code, 1);
  assert.match(r.out, /release\//);
});

test('guard.g9 requires the human-approved label', () => {
  const dir = makeRepo(({ cfg }) => { cfg.guards.requireHumanApprovedLabel = true; });
  const head = git(dir, ['rev-parse', 'HEAD']);
  const path = writeEvent(dir, { base: { sha: head }, head: { sha: head, ref: 'feat/x' }, body: '', labels: [] });
  const r = runGate(dir, ['--pr', '--only=guard.g9-human-approved'], { GITHUB_EVENT_PATH: path });
  assert.equal(r.code, 1);
  assert.match(r.out, /human-approved/);
});

test('sync-ci --from writes the gate and its stamp', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'scripts', 'ci-gate.mjs'), '// stale copy\n');
  const source = join(dir, '..', 'canonical-gate.mjs');
  copyFileSync(GATE, source);
  const r = spawnSync(process.execPath, ['scripts/sync-ci.mjs', '--from=' + source], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, String(r.stdout || '') + String(r.stderr || ''));
  const stamp = JSON.parse(readFileSync(join(dir, 'scripts', 'ci-process.json'), 'utf8'));
  assert.match(stamp.sha256, /^[a-f0-9]{64}$/);
  const synced = readFileSync(join(dir, 'scripts', 'ci-gate.mjs'), 'utf8');
  assert.equal(synced.indexOf('#!/usr/bin/env node'), 0);
});

test('sync-ci --check detects drift', () => {
  const dir = makeRepo();
  const source = join(dir, '..', 'canonical-gate-2.mjs');
  copyFileSync(GATE, source);
  writeFileSync(join(dir, 'scripts', 'ci-gate.mjs'), '// stale copy\n');
  const r = spawnSync(process.execPath, ['scripts/sync-ci.mjs', '--check', '--from=' + source], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr || '') + String(r.stdout || ''), /DRIFT/);
});
