import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const schema = JSON.parse(readFileSync(join(ROOT, 'schema/ci.config.schema.json'), 'utf8'));
const canonical = JSON.parse(readFileSync(join(ROOT, 'ci.config.json'), 'utf8'));
const template = JSON.parse(readFileSync(join(ROOT, 'templates/ci.config.json'), 'utf8'));

const REQUIRED = ['version', 'build', 'typecheck', 'test', 'testGlobs', 'manifest', 'docs', 'tarball', 'release', 'guards'];

test('the schema requires exactly the ten contract keys', () => {
  assert.deepEqual([...schema.required].sort(), [...REQUIRED].sort());
  assert.equal(schema.additionalProperties, false);
});

test('the retired install and gate keys are gone', () => {
  for (const key of ['install', 'gate']) {
    assert.ok(!(key in schema.properties), key + ' is still in the schema');
    assert.ok(!(key in canonical), key + ' is still in the canonical config');
  }
});

test('the schemas accept only the two optional repository-level keys', () => {
  const optional = Object.keys(schema.properties).filter((k) => schema.required.indexOf(k) < 0).sort();
  assert.deepEqual(optional, ['$schema', 'selfHosted']);
});

test('the canonical and template configs use schema keys only', () => {
  for (const cfg of [canonical, template]) {
    for (const key of Object.keys(cfg)) assert.ok(key in schema.properties, 'unknown config key ' + key);
  }
  assert.equal(canonical.selfHosted, true);
  assert.equal(canonical.version, 1);
});

test('the draft-07 schema uses draft-07 tuple syntax', () => {
  const pair = schema.properties.docs.properties.pairs.items;
  assert.ok(Array.isArray(pair.items), 'pairs must use items: [zh, en] in draft-07');
  assert.equal(pair.prefixItems, undefined);
});

test('the canonical config wires all bilingual docs', () => {
  const pairs = canonical.docs.pairs.map((p) => p[0]);
  for (const p of ['README.md', 'PROCESS.md', 'CHANGELOG.md', 'docs/architecture.md']) assert.ok(pairs.indexOf(p) >= 0, 'missing pair ' + p);
});
