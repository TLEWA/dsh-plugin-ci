import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, '..', 'scripts', 'ci-gate.mjs');

const PATCH = 'plugins:\n  - insert:\n      - id: demo\n        name: "@tlewa/demo"\n';
const README = '# demo\n\n## Install\n\n~~~bash\nnpm install @tlewa/demo\n~~~\n\n## License\n\nMIT\n';
const README_EN = README;
const CHANGELOG = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n- Initial release.\n';
const CHANGELOG_EN = CHANGELOG;
const PR_TEMPLATE = '## Checklist\n\n- [ ] I ran the gate locally\n- [ ] I updated the CHANGELOG\n- [ ] I did not add suppressions\n';

function basePackage() {
  return {
    name: '@tlewa/demo',
    version: '1.0.0',
    files: ['lib', 'cordis.patch.yml', 'README.md', 'README.en.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'LICENSE'],
    engines: { dsh: '>=0.2.1-rc.5 <0.3.0-0', node: '>=20' },
    dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } },
    exports: { '.': './lib/index.js' },
    scripts: { test: 'node --test test/run.test.mjs' },
    license: 'MIT',
  };
}

function baseConfig() {
  return {
    version: 1,
    build: null,
    typecheck: null,
    test: 'node --test test/run.test.mjs',
    testGlobs: ['test/**/*.test.mjs'],
    manifest: null,
    docs: {
      pairs: [['README.md', 'README.en.md'], ['CHANGELOG.md', 'CHANGELOG.en.md']],
      required: ['README.md', 'README.en.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'AGENTS.md', 'LICENSE', '.github/PULL_REQUEST_TEMPLATE.md', '.github/workflows/ci.yml'],
      published: [],
    },
    tarball: null,
    release: { publish: false, provenance: false },
    guards: { requireHumanApprovedLabel: false },
  };
}

function callerCi(remote = true) {
  return ['name: ci', 'on: [pull_request, push]', 'jobs:', '  ci:', '    uses: ' + (remote ? 'TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1' : './.github/workflows/reusable-ci.yml'), ''].join('\n');
}
function callerRerun() {
  return ['name: ci-rerun', 'on:', '  pull_request:', '    types: [labeled, unlabeled]', 'permissions:', '  actions: write', 'jobs:', '  rerun:', '    runs-on: ubuntu-latest', '    steps:', '      - run: gh api -X POST "/repos/x/y/actions/runs/1/rerun"', ''].join('\n');
}
function callerDrift(remote = true) {
  return ['name: drift', 'on: workflow_dispatch', 'jobs:', '  drift:', '    uses: ' + (remote ? 'TLEWA/dsh-plugin-ci/.github/workflows/reusable-drift.yml@v1' : './.github/workflows/reusable-drift.yml'), ''].join('\n');
}
function callerRelease() {
  return ['name: release', 'on: [push]', 'jobs:', '  release:', '    uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-release.yml@v1', '    secrets: inherit', ''].join('\n');
}

function write(dir, rel, body) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
function git(dir, args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
function commitAll(dir, message = 'fixture') {
  git(dir, ['add', '-A']);
  const r = git(dir, ['-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '-m', message]);
  if (r.status !== 0) throw new Error('git commit failed: ' + r.stderr);
}

function makeRepo(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gate-'));
  write(dir, 'package.json', JSON.stringify(basePackage(), null, 2));
  write(dir, 'ci.config.json', JSON.stringify(baseConfig(), null, 2));
  write(dir, 'cordis.patch.yml', PATCH);
  write(dir, 'lib/index.js', 'export const demo = true;\n');
  write(dir, 'README.md', README);
  write(dir, 'README.en.md', README_EN);
  write(dir, 'CHANGELOG.md', CHANGELOG);
  write(dir, 'CHANGELOG.en.md', CHANGELOG_EN);
  write(dir, 'AGENTS.md', '# Agent rules\n\nRun the gate.\n');
  write(dir, 'LICENSE', 'MIT\n');
  write(dir, '.gitattributes', '* text=auto eol=lf\n');
  write(dir, '.gitignore', '.ci/\nnode_modules/\n');
  write(dir, '.github/PULL_REQUEST_TEMPLATE.md', PR_TEMPLATE);
  write(dir, '.github/workflows/ci.yml', callerCi());
  write(dir, '.github/workflows/ci-rerun.yml', callerRerun());
  write(dir, '.github/workflows/drift.yml', callerDrift());
  write(dir, '.github/workflows/release.yml', callerRelease());
  write(dir, 'test/run.test.mjs', "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fixture', () => assert.ok(true));\n");
  if (mutate) mutate(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  commitAll(dir, 'fixture');
  return dir;
}

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(GITHUB_|CI$)/.test(k)) continue;
    if (k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  env.NO_COLOR = '1';
  return env;
}
function run(dir, args, extra) {
  return spawnSync(process.execPath, [GATE, '--json'].concat(args || []), {
    cwd: dir,
    encoding: 'utf8',
    env: Object.assign(cleanEnv(), extra || {}),
    timeout: 120000,
  });
}
function runAsync(dir, args, extra) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GATE, '--json'].concat(args || []), {
      cwd: dir,
      env: Object.assign(cleanEnv(), extra || {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('gate timed out: ' + stdout + stderr));
    }, 30000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}
function fakeRegistry(handler) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: 'http://127.0.0.1:' + port });
    });
  });
}
function closeRegistry(server) {
  return new Promise((resolve) => server.close(resolve));
}
function parsed(r) {
  const start = r.stdout.indexOf('{');
  assert.ok(start >= 0, 'no JSON output: ' + r.stdout + r.stderr);
  return JSON.parse(r.stdout.slice(start));
}
function result(json, id) { return json.results.find((x) => x.id === id); }
function expectFail(json, id) {
  const x = result(json, id);
  assert.ok(x, 'missing check ' + id + ' in ' + json.results.map((y) => y.id).join(','));
  assert.equal(x.status, 'fail', id + ' should fail, got ' + x.status + ': ' + x.msg);
  return x;
}

test('verify passes on a wired repository', () => {
  const dir = makeRepo();
  const json = parsed(run(dir, []));
  assert.equal(json.ok, true, JSON.stringify(json.results.filter((x) => x.status === 'fail'), null, 2));
  assert.equal(result(json, 'config.schema').status, 'ok');
  assert.equal(result(json, 'wiring.workflows').status, 'ok');
});

test('requires a prepublish guard when the package is published', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig();
    c.release = { publish: true, provenance: true };
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  expectFail(parsed(run(dir, ['--only=wiring.prepublish'])), 'wiring.prepublish');
});

test('accepts a package whose prepublishOnly calls the canonical guard', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig();
    c.release = { publish: true, provenance: true };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage();
    p.scripts.prepublishOnly = 'npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --prepublish';
    write(d, 'package.json', JSON.stringify(p));
  });
  const json = parsed(run(dir, ['--only=wiring.prepublish']));
  assert.equal(result(json, 'wiring.prepublish').status, 'ok');
});

test('warns with the duplicated engines detail, not the check id', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.manifest = { manifestVersion: 1, requireEnginesNode: false, allowedInject: [] };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage(); p.dsh.engines = { dsh: '>=9.0.0' };
    write(d, 'package.json', JSON.stringify(p));
  });
  const json = parsed(run(dir, ['--only=manifest.engines']));
  const x = result(json, 'manifest.engines');
  assert.equal(x.status, 'warn');
  assert.match(x.msg, /重复声明会被忽略/);
  assert.doesNotMatch(x.msg, /^manifest\.engines$/);
});

test('rejects an unknown config key', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.extra = true;
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  expectFail(parsed(run(dir, ['--only=config.schema'])), 'config.schema');
});

test('rejects a missing required config key', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); delete c.testGlobs;
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  expectFail(parsed(run(dir, ['--only=config.schema'])), 'config.schema');
});

test('requires top-level engines.dsh when the manifest is enabled', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.manifest = { manifestVersion: 1, requireEnginesNode: true, allowedInject: [] };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage(); delete p.engines.dsh;
    write(d, 'package.json', JSON.stringify(p));
  });
  expectFail(parsed(run(dir, ['--only=manifest.engines'])), 'manifest.engines');
});

test('rejects a manifestVersion mismatch', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.manifest = { manifestVersion: 2, requireEnginesNode: false, allowedInject: [] };
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  expectFail(parsed(run(dir, ['--only=manifest.engines'])), 'manifest.engines');
});

test('rejects a patch insert whose name does not match the package', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.manifest = { manifestVersion: 1, requireEnginesNode: true, allowedInject: [] };
    write(d, 'ci.config.json', JSON.stringify(c));
    write(d, 'cordis.patch.yml', 'plugins:\n  - insert:\n      - id: demo\n        name: "@tlewa/other"\n');
  });
  expectFail(parsed(run(dir, ['--only=manifest.bundle'])), 'manifest.bundle');
});

test('rejects a bare inject module', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.manifest = { manifestVersion: 1, requireEnginesNode: true, allowedInject: ['@deepseek-ai/*'] };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage(); p.dsh.client = { inject: ['react'] }; p.exports['./client'] = './lib/client.js';
    write(d, 'package.json', JSON.stringify(p));
    write(d, 'lib/client.js', 'export {};\n');
  });
  expectFail(parsed(run(dir, ['--only=manifest.exports'])), 'manifest.exports');
});

test('rejects bilingual docs with different heading counts', () => {
  const dir = makeRepo((d) => write(d, 'README.en.md', README + '\n## Extra\n'));
  expectFail(parsed(run(dir, ['--only=docs.pairs'])), 'docs.pairs');
});

test('rejects a broken relative link', () => {
  const dir = makeRepo((d) => write(d, 'README.md', README + '\n[missing](docs/nope.md)\n'));
  expectFail(parsed(run(dir, ['--only=docs.links'])), 'docs.links');
});

test('rejects a missing required document', () => {
  const dir = makeRepo((d) => rmSync(join(d, 'AGENTS.md')));
  expectFail(parsed(run(dir, ['--only=files.present'])), 'files.present');
});

test('rejects a tarball that contains mustExclude paths', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig();
    c.tarball = { mustInclude: ['lib/index.js'], mustExclude: ['src/**'], maxBytes: 2097152 };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage(); p.files.push('src');
    write(d, 'package.json', JSON.stringify(p));
    write(d, 'src/internal.js', 'export const internal = 1;\n');
  });
  expectFail(parsed(run(dir, ['--only=tarball.contents'])), 'tarball.contents');
});

test('rejects stale build artifacts', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.build = { command: 'node build.mjs', artifacts: ['lib'], mode: 'git-diff' };
    write(d, 'ci.config.json', JSON.stringify(c));
    write(d, 'build.mjs', "import { writeFileSync } from 'node:fs';\nwriteFileSync('lib/index.js', 'export const demo = ' + Date.now() + ';\\n');\n");
  });
  expectFail(parsed(run(dir, ['--only=artifacts.fresh'])), 'artifacts.fresh');
});

test('rejects a tracked tarball', () => {
  const dir = makeRepo((d) => write(d, 'leftover.tgz', 'x'));
  expectFail(parsed(run(dir, ['--only=repo.hygiene'])), 'repo.hygiene');
});

test('rejects a CHANGELOG that does not start with Unreleased or the version', () => {
  const dir = makeRepo((d) => {
    write(d, 'CHANGELOG.md', '# Changelog\n\n## [0.9.0] - 2025-01-01\n\n- old\n');
    write(d, 'CHANGELOG.en.md', '# Changelog\n\n## [0.9.0] - 2025-01-01\n\n- old\n');
  });
  expectFail(parsed(run(dir, ['--only=version.changelog'])), 'version.changelog');
});

test('wiring fails when a caller workflow is missing', () => {
  const dir = makeRepo((d) => rmSync(join(d, '.github/workflows/drift.yml')));
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('wiring requires a label rerun caller instead of a second ci run', () => {
  const dir = makeRepo((d) => rmSync(join(d, '.github/workflows/ci-rerun.yml')));
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('wiring rejects a ci workflow that starts a new run on label changes', () => {
  const dir = makeRepo((d) => write(d, '.github/workflows/ci.yml',
    callerCi().replace('on: [pull_request, push]', 'on:\n  pull_request:\n    types: [opened, labeled]\n  push:\n')));
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('wiring fails when a gate copy is committed', () => {
  const dir = makeRepo((d) => write(d, 'scripts/ci-gate.mjs', '// copied gate\n'));
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('wiring fails when an external repo calls the reusable workflow locally', () => {
  const dir = makeRepo((d) => write(d, '.github/workflows/ci.yml', callerCi(false)));
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('wiring ignores a uses: line that is only a YAML comment', () => {
  const dir = makeRepo((d) => write(d, '.github/workflows/ci.yml', '# uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1\nname: ci\non: [push]\n'));
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('wiring accepts a selfHosted repository with local reusable workflows', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.selfHosted = true;
    write(d, 'ci.config.json', JSON.stringify(c));
    write(d, '.github/workflows/ci.yml', callerCi(false));
    write(d, '.github/workflows/reusable-ci.yml', 'on: workflow_call\n');
    write(d, '.github/workflows/reusable-release.yml', 'on: workflow_call\n');
    write(d, '.github/workflows/reusable-drift.yml', 'on: workflow_call\n');
  });
  const json = parsed(run(dir, ['--only=wiring.workflows']));
  assert.equal(result(json, 'wiring.workflows').status, 'ok');
});

test('wiring lets a selfHosted repo vendor the gate without a .ci checkout', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.selfHosted = true;
    write(d, 'ci.config.json', JSON.stringify(c));
    write(d, '.github/workflows/ci.yml', callerCi(false));
    write(d, '.github/workflows/reusable-ci.yml', 'on: workflow_call\n');
    write(d, '.github/workflows/reusable-release.yml', 'on: workflow_call\n');
    write(d, '.github/workflows/reusable-drift.yml', 'on: workflow_call\n');
    write(d, 'scripts/ci-gate.mjs', '// vendored gate\n');
    write(d, '.gitignore', 'node_modules/\n');
  });
  const json = parsed(run(dir, ['--only=wiring.workflows', '--skip=tests']));
  assert.equal(result(json, 'wiring.workflows').status, 'ok');
});

test('wiring still rejects sync artifacts in a selfHosted repo', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.selfHosted = true;
    write(d, 'ci.config.json', JSON.stringify(c));
    write(d, '.github/workflows/ci.yml', callerCi(false));
    write(d, '.github/workflows/reusable-ci.yml', 'on: workflow_call\n');
    write(d, '.github/workflows/reusable-release.yml', 'on: workflow_call\n');
    write(d, '.github/workflows/reusable-drift.yml', 'on: workflow_call\n');
    write(d, 'scripts/ci-process.json', '{}\n');
  });
  expectFail(parsed(run(dir, ['--only=wiring.workflows'])), 'wiring.workflows');
});

test('publishing requires a matching package.repository', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.release.publish = true;
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage(); p.repository = { type: 'git', url: 'https://github.com/tlewa/other.git' };
    write(d, 'package.json', JSON.stringify(p));
  });
  expectFail(parsed(run(dir, ['--only=wiring.repository'])), 'wiring.repository');
});

test('release.r1 compares the tag with package.json', () => {
  const dir = makeRepo();
  expectFail(parsed(run(dir, ['--release', '--only=release.r1-tag-version'], { GITHUB_REF_NAME: 'v9.9.9' })), 'release.r1-tag-version');
});

test('release.r2 rejects a tag that is not on main', () => {
  const dir = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'feature']);
  write(dir, 'lib/index.js', 'export const demo = 2;\n');
  commitAll(dir, 'not on main');
  git(dir, ['tag', 'v1.0.0']);
  const json = parsed(run(dir, ['--release', '--only=release.r2-ancestor'], { GITHUB_REF_NAME: 'v1.0.0' }));
  expectFail(json, 'release.r2-ancestor');
});

test('release.r3 ignores the untracked .ci checkout', () => {
  const dir = makeRepo((d) => write(d, '.ci/scripts/ci-gate.mjs', '// canonical checkout\n'));
  const json = parsed(run(dir, ['--release', '--only=release.r3-clean-tree']));
  assert.equal(result(json, 'release.r3-clean-tree').status, 'ok');
});

function prRepo(mutate, prExtra) {
  const dir = makeRepo();
  const base = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  if (mutate) mutate(dir);
  git(dir, ['checkout', '-q', '-b', 'feat/change']);
  commitAll(dir, 'pr change');
  const head = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  const event = { pull_request: { number: 1, body: 'done', labels: [], head: { ref: 'feat/change', sha: head }, base: { sha: base } } };
  Object.assign(event.pull_request, prExtra || {});
  const path = join(dir, '.event.json');
  writeFileSync(path, JSON.stringify(event));
  return { dir, event: path };
}

test('guard.g1 requires the PR checklist', () => {
  const { dir, event } = prRepo((d) => write(d, 'lib/index.js', 'export const demo = 3;\n'), { body: 'no checklist' });
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g1-checklist'], { GITHUB_EVENT_PATH: event })), 'guard.g1-checklist');
});

test('guard.g2 rejects a non-conventional branch name', () => {
  const { dir, event } = prRepo((d) => write(d, 'lib/index.js', 'export const demo = 3;\n'), { head: { ref: 'random-branch' } });
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g2-branch'], { GITHUB_EVENT_PATH: event })), 'guard.g2-branch');
});

test('guard.g3 rejects focused tests added by the PR', () => {
  const { dir, event } = prRepo((d) => write(d, 'test/extra.test.mjs', "test.only('x', () => {});\n"));
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g3-focus-tests'], { GITHUB_EVENT_PATH: event })), 'guard.g3-focus-tests');
});

test('guard.g5 requires the ci-change label for sensitive files', () => {
  const { dir, event } = prRepo((d) => write(d, 'ci.config.json', JSON.stringify(baseConfig(), null, 2) + '\n'));
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g5-sensitive'], { GITHUB_EVENT_PATH: event })), 'guard.g5-sensitive');
});

test('guard.g5 also protects canonical policy scripts, schemas and rulesets', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.selfHosted = true;
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  const base = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  write(dir, 'scripts/ci-gate.mjs', '// changed policy\n');
  git(dir, ['checkout', '-q', '-b', 'feat/change']);
  commitAll(dir, 'policy change');
  const head = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  const event = join(dir, '.event.json');
  writeFileSync(event, JSON.stringify({ pull_request: { number: 1, body: 'done', labels: [], head: { ref: 'feat/change', sha: head }, base: { sha: base } } }));
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g5-sensitive'], { GITHUB_EVENT_PATH: event })), 'guard.g5-sensitive');
});

test('guard.g7 only allows version bumps on release branches', () => {
  const { dir, event } = prRepo((d) => {
    const p = basePackage(); p.version = '1.0.1';
    write(d, 'package.json', JSON.stringify(p));
  });
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g7-version-bump'], { GITHUB_EVENT_PATH: event })), 'guard.g7-version-bump');
});

test('guard.g9 requires the human-approved label', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.guards.requireHumanApprovedLabel = true;
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  const base = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  write(dir, 'lib/index.js', 'export const demo = 4;\n');
  git(dir, ['checkout', '-q', '-b', 'feat/change']);
  commitAll(dir, 'pr change');
  const head = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  const event = join(dir, '.event.json');
  writeFileSync(event, JSON.stringify({ pull_request: { number: 1, body: 'done', labels: [], head: { ref: 'feat/change', sha: head }, base: { sha: base } } }));
  expectFail(parsed(run(dir, ['--pr', '--only=guard.g9-human-approved'], { GITHUB_EVENT_PATH: event })), 'guard.g9-human-approved');
});

test('guard.g9 reads live labels so a rerun sees the label that was just added', () => {
  const dir = makeRepo((d) => {
    const c = baseConfig(); c.guards.requireHumanApprovedLabel = true;
    write(d, 'ci.config.json', JSON.stringify(c));
  });
  const base = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  write(dir, 'lib/index.js', 'export const demo = 5;\n');
  git(dir, ['checkout', '-q', '-b', 'feat/change']);
  commitAll(dir, 'pr change');
  const head = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  const event = join(dir, '.event.json');
  writeFileSync(event, JSON.stringify({ pull_request: { number: 1, body: 'done', labels: [], head: { ref: 'feat/change', sha: head }, base: { sha: base } } }));

  const live = parsed(run(dir, ['--pr', '--only=guard.g9-human-approved'], { GITHUB_EVENT_PATH: event, DSH_CI_PR_LABELS: 'ci-change,human-approved' }));
  assert.equal(result(live, 'guard.g9-human-approved').status, 'ok');

  const stale = parsed(run(dir, ['--pr', '--only=guard.g9-human-approved'], { GITHUB_EVENT_PATH: event, DSH_CI_PR_LABELS: '' }));
  expectFail(stale, 'guard.g9-human-approved');
});

test('guard.g1 reads the live PR body so a rerun sees a fixed checklist', () => {
  const checked = PR_TEMPLATE.replace(/- \[ \]/g, '- [x]');
  const dir = makeRepo();
  const base = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  write(dir, 'lib/index.js', 'export const demo = 6;\n');
  git(dir, ['checkout', '-q', '-b', 'feat/change']);
  commitAll(dir, 'pr change');
  const head = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
  const event = join(dir, '.event.json');
  writeFileSync(event, JSON.stringify({ pull_request: { number: 1, body: 'no checklist', labels: [], head: { ref: 'feat/change', sha: head }, base: { sha: base } } }));

  const live = parsed(run(dir, ['--pr', '--only=guard.g1-checklist'], { GITHUB_EVENT_PATH: event, DSH_CI_PR_BODY: checked }));
  assert.equal(result(live, 'guard.g1-checklist').status, 'ok');

  const stale = parsed(run(dir, ['--pr', '--only=guard.g1-checklist'], { GITHUB_EVENT_PATH: event, DSH_CI_PR_BODY: 'no checklist' }));
  expectFail(stale, 'guard.g1-checklist');
});

test('label gates fail closed when the live PR lookup fails in CI', async () => {
  const http = await import('node:http');
  let mode = 'ok';
  const server = http.createServer((req, res) => {
    if (mode === 'fail') {
      res.statusCode = 503;
      res.end('{"message":"unavailable"}');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ labels: [{ name: 'human-approved' }], body: 'done' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const dir = makeRepo((d) => {
      const c = baseConfig(); c.guards.requireHumanApprovedLabel = true;
      write(d, 'ci.config.json', JSON.stringify(c));
    });
    const base = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
    write(dir, 'lib/index.js', 'export const demo = 7;\n');
    git(dir, ['checkout', '-q', '-b', 'feat/change']);
    commitAll(dir, 'pr change');
    const head = String(git(dir, ['rev-parse', 'HEAD']).stdout).trim();
    const event = join(dir, '.event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { number: 1, body: 'done', labels: ['human-approved'], head: { ref: 'feat/change', sha: head }, base: { sha: base } } }));
    const extra = {
      GITHUB_EVENT_PATH: event,
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'TLEWA/demo',
      DSH_CI_PR_API_URL: 'http://127.0.0.1:' + port,
    };

    const ok = parsed(await runAsync(dir, ['--pr', '--only=guard.g9-human-approved'], extra));
    assert.equal(result(ok, 'guard.g9-human-approved').status, 'ok');

    mode = 'fail';
    const failed = parsed(await runAsync(dir, ['--pr', '--only=guard.g9-human-approved'], extra));
    expectFail(failed, 'guard.g9-human-approved');
    assert.equal(result(failed, 'guard.g9-human-approved').status, 'fail');
    assert.match(result(failed, 'guard.g9-human-approved').msg, /无法通过 GitHub API 读取 PR 当前状态/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('release.r7-post waits for registry propagation before passing', async () => {
  const sha = 'a'.repeat(40);
  const dir = makeRepo((d) => {
    const c = baseConfig();
    c.release = { publish: true, provenance: true };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage();
    p.version = '1.2.3';
    write(d, 'package.json', JSON.stringify(p));
  });
  let hits = 0;
  const { server, url } = await fakeRegistry((req, res) => {
    hits += 1;
    if (hits < 3) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ gitHead: sha, dist: { integrity: 'sha512-test', attestations: { provenance: {} } } }));
  });
  try {
    const r = await runAsync(dir, ['--after-publish', '--only=release.r7-post'], {
      DSH_CI_EXPECTED_SHA: sha,
      DSH_CI_REGISTRY_URL: url,
      DSH_CI_REGISTRY_ATTEMPTS: '4',
      DSH_CI_REGISTRY_DELAY_MS: '10',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const json = parsed(r);
    assert.equal(result(json, 'release.r7-post').status, 'ok');
    assert.equal(hits, 3);
  } finally {
    await closeRegistry(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('release.r7-post reports a registry timeout after the configured attempts', async () => {
  const dir = makeRepo((d) => {
    const c = baseConfig();
    c.release = { publish: true, provenance: true };
    write(d, 'ci.config.json', JSON.stringify(c));
    const p = basePackage();
    p.version = '1.2.3';
    write(d, 'package.json', JSON.stringify(p));
  });
  let hits = 0;
  const { server, url } = await fakeRegistry((req, res) => {
    hits += 1;
    res.statusCode = 404;
    res.end('{}');
  });
  try {
    const r = await runAsync(dir, ['--after-publish', '--only=release.r7-post'], {
      DSH_CI_EXPECTED_SHA: 'b'.repeat(40),
      DSH_CI_REGISTRY_URL: url,
      DSH_CI_REGISTRY_ATTEMPTS: '3',
      DSH_CI_REGISTRY_DELAY_MS: '400',
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const x = expectFail(parsed(r), 'release.r7-post');
    assert.match(x.msg, /等待约 1 秒后仍返回 404/);
    assert.equal(hits, 3);
  } finally {
    await closeRegistry(server);
    rmSync(dir, { recursive: true, force: true });
  }
});
