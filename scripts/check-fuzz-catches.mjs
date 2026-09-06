#!/usr/bin/env node
/**
 * Prove the fuzz suites catch something, the same way the checkpoint properties
 * are proved.
 *
 * A fuzz run that stays green is the easiest kind of test to get wrong: the
 * generator never reaches the shape, and the result is indistinguishable from
 * the code being correct. That happened twice while writing these. The
 * interleaving fuzz missed the order-sensitive inverse entirely because its
 * `shuffle` unshifted an array, and mutative emits whole-element replaces for a
 * draftable value where it emits a patch per index for a scalar -- one token in
 * the generator, and a whole class of bug out of reach.
 *
 * Each defect below is a real one this repository shipped. Reverting the files
 * that fixed it has to turn the named suite red.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const defects = [
  {
    name: 'a write after an await never reaching the patch stream',
    fixedBy: 'd490498',
    files: [
      'packages/core/src/getRawStateLocalAction.ts',
      'packages/core/src/internal.ts'
    ],
    suites: ['packages/coaction-mobx/test/interleaving.fuzz.test.ts']
  },
  {
    name: 'store.apply(state, patches) publishing no commit',
    fixedBy: '73f4931',
    files: [
      'packages/core/src/storeFactory.ts',
      'packages/core/src/storeCommit.ts',
      'packages/core/src/handleDraft.ts',
      'packages/core/src/handleState.ts',
      'packages/core/src/replaceExternalStoreState.ts'
    ],
    suites: ['packages/core/test/writePaths.fuzz.test.ts']
  },
  {
    name: 'an inverse pair that cannot be applied in the order it comes',
    fixedBy: 'bbbe91e',
    files: [
      'packages/core/src/utils.ts',
      'packages/core/src/handleState.ts',
      'packages/core/src/handleDraft.ts',
      'packages/core/src/replaceExternalStoreState.ts'
    ],
    suites: [
      'packages/core/test/writePaths.fuzz.test.ts',
      'packages/coaction-mobx/test/interleaving.fuzz.test.ts'
    ]
  }
];

const git = (...args) =>
  execFileSync('git', args, { cwd: rootDir, stdio: 'pipe' }).toString();

const dirty = git(
  'status',
  '--porcelain',
  '--',
  ...defects.flatMap((d) => d.files)
).trim();
if (dirty) {
  console.error(
    'Uncommitted changes in the files this rewinds. Commit or stash first:'
  );
  console.error(dirty);
  process.exit(1);
}

const runSuites = (suites) => {
  try {
    execFileSync(
      'npx',
      ['vitest', 'run', ...suites, '--no-file-parallelism', '--reporter=dot'],
      { cwd: rootDir, stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
};

const missed = [];
try {
  for (const defect of defects) {
    // `<commit>` here is the commit that fixed it, so its parent is the state
    // with the defect present.
    git('checkout', `${defect.fixedBy}~1`, '--', ...defect.files);
    if (runSuites(defect.suites)) {
      missed.push(defect.name);
      console.log(`MISSED  ${defect.name}`);
    } else {
      console.log(`caught  ${defect.name}`);
    }
    git('checkout', 'HEAD', '--', ...defect.files);
  }
} finally {
  git('checkout', 'HEAD', '--', ...new Set(defects.flatMap((d) => d.files)));
}

const stillDirty = git(
  'status',
  '--porcelain',
  '--',
  ...defects.flatMap((d) => d.files)
).trim();
if (stillDirty) {
  console.error(
    'Source was not restored. Check `git diff` before doing anything else.'
  );
  process.exit(1);
}

if (missed.length) {
  console.error('\nDefects the fuzz suites no longer catch:');
  for (const name of missed) console.error(`  - ${name}`);
  console.error(
    '\nThe generators have drifted away from the shapes that break the runtime.'
  );
  process.exit(1);
}

console.log(`\nAll ${defects.length} defects were caught.`);
