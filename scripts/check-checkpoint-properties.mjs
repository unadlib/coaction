#!/usr/bin/env node
/**
 * Prove the checkpoint property tests catch something.
 *
 * A property test that passes tells you nothing on its own -- an assertion that
 * cannot fail passes too, and this repository has shipped more than one of
 * those: a fuzz whose snapshot could never differ from what it compared
 * against, a helper named for what it was meant to check and written to check
 * something else. Both went green for weeks.
 *
 * So each mutation below breaks the parser in a way that matters, the property
 * suite runs against it, and a mutation that survives is reported as a hole in
 * the properties rather than as a pass.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parserPath = resolve(rootDir, 'packages/coaction-sync/src/checkpoint.ts');
const testPath = 'packages/coaction-sync/test/checkpoint.property.test.ts';

/**
 * Mutations that do not change behaviour, and why. Listing them is the point:
 * an unexplained survivor is a hole in the properties, and one of these looks
 * exactly like a hole until you work out that it is not.
 */
const equivalent = [
  // While CHECKPOINT_FORMAT_VERSION is 1, no non-integer can reach the integer
  // check: anything below 1 is caught by `version < 1` and anything above by
  // the newer-format check. It becomes reachable at version 2, where 1.5 sits
  // between the two. The check is right to be there; there is just nothing for
  // a property to observe yet.
  ['!Number.isInteger(version) ||', '']
];

/** Each is [name, find, replace]. `find` must appear exactly once. */
const mutations = [
  [
    'accepts a non-array outbox',
    'if (!Array.isArray(value)) reject',
    'if (false && !Array.isArray(value)) reject'
  ],
  [
    'accepts a malformed mutation',
    'if (index !== -1) {',
    'if (false && index !== -1) {'
  ],
  [
    'accepts duplicate mutation ids',
    'if (new Set(outbox.map(({ id }) => id)).size !== outbox.length) {',
    'if (false) {'
  ],
  ['accepts a top-level array', '|| Array.isArray(parsed)', ''],
  [
    'accepts a newer format',
    '(version as number) > CHECKPOINT_FORMAT_VERSION',
    'false'
  ],
  ['accepts formatVersion 0 and below', 'version < 1', 'version < -1'],

  ['accepts a non-string id', "typeof id === 'string' &&", ''],
  ['accepts a non-finite createdAt', 'Number.isFinite(createdAt) &&', ''],
  [
    'accepts a patch with an unknown op',
    "if (op !== 'add' && op !== 'replace' && op !== 'remove') return false;",
    ''
  ],
  [
    'accepts a patch with a bad path',
    "} else if (typeof path !== 'string') {\n    return false;\n  }",
    '}'
  ],
  [
    'loses a field on the way out',
    'return body;',
    'return { ...body, cursor: undefined };'
  ]
];

const original = readFileSync(parserPath, 'utf8');
const survivors = [];

const runSuite = () => {
  try {
    execFileSync(
      'npx',
      ['vitest', 'run', testPath, '--no-file-parallelism', '--reporter=dot'],
      { cwd: rootDir, stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
};

try {
  if (!runSuite()) {
    console.error(
      'The property suite fails before any mutation. Fix that first.'
    );
    process.exit(1);
  }
  for (const [find] of equivalent) {
    if (original.split(find).length - 1 !== 1) {
      survivors.push(
        `an equivalent mutation no longer matches the parser: ${find}`
      );
    }
  }
  for (const [name, find, replace] of mutations) {
    const occurrences = original.split(find).length - 1;
    if (occurrences !== 1) {
      survivors.push(
        `${name}: its target appears ${occurrences} times, not once`
      );
      continue;
    }
    writeFileSync(parserPath, original.replace(find, replace));
    if (runSuite()) {
      survivors.push(name);
      console.log(`SURVIVED  ${name}`);
    } else {
      console.log(`killed    ${name}`);
    }
  }
} finally {
  writeFileSync(parserPath, original);
}

if (readFileSync(parserPath, 'utf8') !== original) {
  console.error(
    'The parser was not restored. Check `git diff` before doing anything else.'
  );
  process.exit(1);
}

if (survivors.length) {
  console.error('\nMutations the properties did not catch:');
  for (const survivor of survivors) console.error(`  - ${survivor}`);
  console.error(
    '\nEach one is a way the parser could break with the suite still green.'
  );
  process.exit(1);
}

console.log(
  `\nAll ${mutations.length} mutations were caught (${equivalent.length} known-equivalent mutation excluded).`
);
