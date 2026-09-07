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
 *
 * The commits are addressed by hash, so they have to stay reachable. Rewriting
 * the history that contains them -- a rebase of `main`, a squash that replaces
 * them -- breaks this check for everybody, and the failure says which hash it
 * could not find. Recovering means finding the new hash for the same change and
 * updating the entry, or dropping the entry if the change no longer exists as
 * one commit; both are better than deleting the check, which is what makes a
 * green fuzz run mean something.
 *
 * `scripts/SIZE-BUDGETS.md` and this comment are the two places where a piece
 * of tooling depends on something outside its own file. Both say so.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
  },
  {
    name: 'a refusal skipping the hand-back to an action still waiting',
    fixedBy: 'b378992',
    files: ['packages/core/src/getRawStateLocalAction.ts'],
    suites: ['packages/coaction-mobx/test/interleaving.fuzz.test.ts']
  },
  {
    name: 'a transaction handed past the action still waiting for it',
    fixedBy: '393b7bc',
    files: [
      'packages/core/src/getRawStateLocalAction.ts',
      'packages/core/src/internal.ts'
    ],
    suites: ['packages/coaction-mobx/test/interleaving.fuzz.test.ts']
  }
];

const git = (...args) =>
  execFileSync('git', args, { cwd: rootDir, stdio: 'pipe' });

/**
 * The historical content is read out of git and written over the working file,
 * which is then restored from what was there before -- not from git. Rewinding
 * with `git checkout` instead would discard uncommitted work, and refusing to
 * run while anything is uncommitted would mean `pnpm check` fails during
 * ordinary editing of exactly the files this is about.
 */
const paths = [...new Set(defects.flatMap((defect) => defect.files))];
const saved = new Map(
  paths.map((path) => [path, readFileSync(join(rootDir, path), 'utf8')])
);
const restore = () => {
  for (const [path, content] of saved) {
    writeFileSync(join(rootDir, path), content);
  }
};

// The rewind needs the parent of each fixing commit, which a shallow clone does
// not have. Say so here rather than fail somewhere inside a vitest run.
const missing = defects
  .map(({ fixedBy }) => fixedBy)
  .filter((sha) => {
    try {
      git('cat-file', '-e', `${sha}~1^{commit}`);
      return false;
    } catch {
      return true;
    }
  });
if (missing.length) {
  console.error(
    `This needs the history around ${missing.join(', ')}, which this checkout does not have.`
  );
  console.error(
    'A shallow clone is the usual cause: in GitHub Actions give actions/checkout `fetch-depth: 0`, locally run `git fetch --unshallow`.'
  );
  console.error(
    'If the history was rewritten instead, find the new hash for the same change and update the entry in this file.'
  );
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'coaction-fuzz-catches-'));
const report = join(scratch, 'results.json');
const runSuites = (suites) => {
  rmSync(report, { force: true });
  try {
    execFileSync(
      'npx',
      [
        'vitest',
        'run',
        ...suites,
        '--no-file-parallelism',
        '--reporter=json',
        '--outputFile',
        report
      ],
      { cwd: rootDir, stdio: 'pipe' }
    );
  } catch {
    // The report below distinguishes a regression assertion from a loader error.
  }
  const result = JSON.parse(readFileSync(report, 'utf8'));
  const failed = result.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter((test) => test.status === 'failed');
  const messages = failed.flatMap((test) => test.failureMessages).join('\n');
  if (
    !result.numTotalTests ||
    /is not a function|does not provide an export|Cannot find module|is not defined/.test(
      messages
    )
  ) {
    throw new Error(
      `Historical fixture no longer executes the intended runtime:\n${messages.slice(0, 1600)}`
    );
  }
  return { passed: result.success, failed: failed.length };
};

const missed = [];
try {
  if (
    !runSuites([...new Set(defects.flatMap(({ suites }) => suites))]).passed
  ) {
    throw new Error(
      'The current fuzz suites must pass before testing historical defects.'
    );
  }
  for (const defect of defects) {
    // `fixedBy` is the commit that fixed it, so its parent is the state with
    // the defect present.
    for (const path of defect.files) {
      writeFileSync(
        join(rootDir, path),
        git('show', `${defect.fixedBy}~1:${path}`).toString()
      );
    }
    const result = runSuites(defect.suites);
    if (result.passed || result.failed === 0) {
      missed.push(defect.name);
      console.log(`MISSED  ${defect.name}`);
    } else {
      console.log(`caught  ${defect.name}`);
    }
    restore();
  }
} finally {
  restore();
  rmSync(scratch, { recursive: true, force: true });
}

for (const [path, content] of saved) {
  if (readFileSync(join(rootDir, path), 'utf8') !== content) {
    console.error(
      `${path} was not restored. Check it before doing anything else.`
    );
    process.exit(1);
  }
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
