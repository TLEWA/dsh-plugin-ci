import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(join(root, 'templates/AGENTS.md'), 'utf8');
const english = readFileSync(join(root, 'templates/AGENTS.en.md'), 'utf8');
function fixture(t, text = template, en) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-review-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  writeFileSync(join(dir, 'AGENTS.md'), text);
  if (en !== undefined) writeFileSync(join(dir, 'AGENTS.en.md'), en);
  return dir;
}
const run = dir => spawnSync(process.execPath, [join(root, 'scripts/check-review-policy.mjs'), dir], {cwd:tmpdir(), encoding:'utf8'});
test('accepts canonical rules and preserves all local files and instructions', t => {
  const dir = fixture(t, '# Local instructions\n\n' + template + '\nLocal plugin constraints\n', english);
  const before = readdirSync(dir).map(f => [f, readFileSync(join(dir,f),'utf8')]);
  assert.equal(run(dir).status, 0);
  assert.deepEqual(readdirSync(dir).map(f => [f, readFileSync(join(dir,f),'utf8')]), before);
});
test('accepts CRLF and absent optional English document', t => {
  assert.equal(run(fixture(t, template.replace(/\r?\n/g,'\r\n'))).status, 0);
});
for (const [name, text] of [
  ['missing', '# Local only\n'],
  ['outdated', template.replaceAll('policy:v1:', 'policy:v0:')],
  ['modified', template.replace('用中文', '用英文')],
  ['duplicate', template + '\n' + template],
  ['mismatched', template.replace('policy:v1:end', 'policy:v2:end')],
  ['truncated', template.replace('<!-- dsh-review-policy:v1:end -->','')],
]) test('rejects ' + name + ' rules', t => assert.equal(run(fixture(t,text)).status,1));
test('validates English when present', t => assert.equal(run(fixture(t,template,'# Unmanaged English')).status,1));
test('fails clearly for missing repository and invalid arguments', t => {
  const dir = fixture(t);
  assert.equal(run(join(dir,'absent')).status,1);
  const result = spawnSync(process.execPath, [join(root,'scripts/check-review-policy.mjs')], {encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Usage:/);
});
