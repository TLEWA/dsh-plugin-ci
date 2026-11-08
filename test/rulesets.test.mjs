import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

test('main protection requires the reusable workflow aggregate check', () => {
  const main = read('rulesets/main.json');
  assert.equal(main.enforcement, 'active');
  assert.deepEqual(main.bypass_actors, []);
  const checks = main.rules.find((r) => r.type === 'required_status_checks');
  assert.ok(checks, 'missing required_status_checks');
  assert.deepEqual(checks.parameters.required_status_checks.map((c) => c.context), ['ci / ci-ok']);
  assert.equal(checks.parameters.strict_required_status_checks_policy, true);
  const pr = main.rules.find((r) => r.type === 'pull_request');
  assert.ok(pr, 'missing pull_request rule');
  assert.equal(pr.parameters.required_approving_review_count, 0);
  assert.equal(pr.parameters.required_review_thread_resolution, true);
});

test('main protection forbids deletion, force pushes and merge commits', () => {
  const types = read('rulesets/main.json').rules.map((r) => r.type);
  for (const t of ['deletion', 'non_fast_forward', 'required_linear_history']) assert.ok(types.indexOf(t) >= 0, 'missing ' + t);
});

test('release tags protect semver tags but leave the moving major tag movable', () => {
  const tags = read('rulesets/tags-v.json');
  assert.equal(tags.target, 'tag');
  assert.deepEqual(tags.conditions.ref_name.include, ['refs/tags/v*.*.*']);
  assert.deepEqual(tags.rules.map((r) => r.type).sort(), ['deletion', 'update']);
  assert.deepEqual(tags.bypass_actors, []);
});
