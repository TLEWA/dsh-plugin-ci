#!/usr/bin/env node
/** Read-only local adoption check. No GitHub access or target code execution. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonical = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const normalize = text => text.replace(/\r\n/g, '\n');
function extract(text, label) {
  const lines = normalize(text).split('\n');
  const starts = lines.flatMap((line, i) => /^<!-- dsh-review-policy:v\d+:start -->$/.test(line) ? [i] : []);
  const ends = lines.flatMap((line, i) => /^<!-- dsh-review-policy:v\d+:end -->$/.test(line) ? [i] : []);
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) throw Error(label + ': missing, duplicate, or malformed review policy block');
  const start = lines[starts[0]].match(/:v(\d+):/)[1];
  const end = lines[ends[0]].match(/:v(\d+):/)[1];
  if (start !== end) throw Error(label + ': mismatched review policy version');
  return lines.slice(starts[0], ends[0] + 1).join('\n');
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) throw Error('Usage: node scripts/check-review-policy.mjs <repository-path>');
  const target = resolve(args[0]);
  for (const file of ['AGENTS.md', 'AGENTS.en.md']) {
    if (file === 'AGENTS.en.md' && !existsSync(join(target, file))) continue;
    const expected = extract(readFileSync(join(canonical, 'templates', file), 'utf8'), 'template/' + file);
    const actual = extract(readFileSync(join(target, file), 'utf8'), file);
    if (actual !== expected) throw Error(file + ': review policy is outdated or modified; adopt the canonical template block without replacing repository-specific instructions');
    console.log('OK ' + file + ' review policy v1');
  }
} catch (error) {
  console.error('FAIL ' + error.message);
  process.exitCode = 1;
}
