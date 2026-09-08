#!/usr/bin/env node
/**
 * Run the property and fuzz suites far past their everyday size.
 *
 * The counts in those suites are sized to run on every commit. That is enough
 * to keep a known defect from coming back -- `check-fuzz-catches.mjs` proves
 * each one still does -- and not enough to be evidence that nothing else is
 * there. This turns the scale up and moves the starting seed, so a soak covers
 * territory the everyday run never reaches and two soaks are not the same soak.
 *
 * It is deliberately outside `pnpm check`. A run at scale 50 takes minutes, and
 * a check that people skip is worse than one that does less.
 *
 *   pnpm soak                  # scale 50, seeds from 1,000,000
 *   pnpm soak 100 5000000      # scale and starting seed
 *
 * A failure prints the seed and, for the schedule fuzzes, the sequence of
 * actions that produced it. Put that seed in the suite as a fixed case before
 * fixing anything.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scale = Number(process.argv[2] ?? 50);
const seedOffset = Number(process.argv[3] ?? 1_000_000);

const suites = [
  'packages/core/test/patchAlgebra.property.test.ts',
  'packages/core/test/graphState.property.test.ts',
  'packages/core/test/computedSnapshots.property.test.ts',
  'packages/core/test/derived.property.test.ts',
  'packages/core/test/writePaths.fuzz.test.ts',
  'packages/coaction-sync/test/checkpoint.property.test.ts',
  'packages/coaction-mobx/test/interleaving.fuzz.test.ts',
  'packages/coaction-sync/test/stateMachine.fuzz.test.ts'
];

console.log(
  `Soaking ${suites.length} suites at ${scale}x from seed ${seedOffset.toLocaleString()}.\n`
);

const started = Date.now();
let failed = false;
for (const suite of suites) {
  const suiteStarted = Date.now();
  try {
    execFileSync(
      'npx',
      [
        'vitest',
        'run',
        suite,
        '--no-file-parallelism',
        '--reporter=dot',
        '--testTimeout=1800000',
        '--hookTimeout=1800000'
      ],
      {
        cwd: rootDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          COACTION_FUZZ_SCALE: String(scale),
          COACTION_FUZZ_SEED_OFFSET: String(seedOffset)
        }
      }
    );
    console.log(
      `  ok    ${suite}  (${Math.round((Date.now() - suiteStarted) / 1000)}s)`
    );
  } catch (error) {
    failed = true;
    console.error(`  FAIL  ${suite}\n`);
    console.error(
      [error.stdout?.toString(), error.stderr?.toString()]
        .filter(Boolean)
        .join('\n')
        .split('\n')
        .filter((line) => line.trim())
        .slice(-40)
        .join('\n')
    );
  }
}

console.log(`\n${Math.round((Date.now() - started) / 1000)}s total.`);
if (failed) {
  console.error('Soak failed. The seed above reproduces it at this scale.');
  process.exit(1);
}
console.log('Soak passed.');
