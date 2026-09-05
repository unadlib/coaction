#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const packagesDir = join(rootDir, 'packages');
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const readPackages = () =>
  readdirSync(packagesDir)
    .map((dir) => join(packagesDir, dir, 'package.json'))
    .filter(existsSync)
    .map((packageJsonPath) => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      return {
        dir: dirname(packageJsonPath),
        json: packageJson
      };
    })
    .filter(({ json }) => !json.private)
    .sort((a, b) => a.json.name.localeCompare(b.json.name));

const run = (label, args) => {
  console.log(`\n== ${label} ==`);

  const result = spawnSync(pnpmBin, args, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

for (const { dir, json } of readPackages()) {
  const relativeDir = relative(rootDir, dir);

  run(`${json.name}: publint`, [
    'exec',
    'publint',
    'run',
    relativeDir,
    '--strict',
    '--level',
    'warning',
    '--pack',
    'pnpm'
  ]);

  run(`${json.name}: attw`, [
    'exec',
    'attw',
    '--pack',
    relativeDir,
    '--format',
    'table',
    '--no-emoji',
    '--no-color'
  ]);
}

/**
 * Every workspace package needs a tsconfig path mapping to its source.
 *
 * Without one, `tsc` resolves its types through `dist`, which a clean checkout
 * does not have -- and `pnpm check` typechecks before it builds. The failure
 * only appears on CI, because a developer's tree has been built before.
 */
const tsconfigPaths = JSON.parse(
  readFileSync(join(rootDir, 'tsconfig.json'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
).compilerOptions.paths;
const unmapped = readPackages()
  .map(({ json }) => json.name)
  .filter((name) => !tsconfigPaths[name]);
if (unmapped.length) {
  console.error(
    `\nMissing tsconfig path mappings for: ${unmapped.join(', ')}\nAdd them to tsconfig.json "paths" so typecheck resolves source rather than dist.`
  );
  process.exit(1);
}

/**
 * Only the producer may reach for the draft library.
 *
 * Everything else consumes commits -- patches, inverse patches, a source -- and
 * a package that imports Mutative to read or write one has taken a position on
 * how transitions are made, which is the coupling the patch IR exists to
 * remove. `coaction` itself is where the producer lives.
 */
const commitConsumers = readPackages().filter(
  ({ json }) => json.name !== 'coaction'
);
const coupled = commitConsumers.filter(({ dir }) => {
  const srcDir = join(dir, 'src');
  if (!existsSync(srcDir)) return false;
  return readdirSync(srcDir).some(
    (file) =>
      file.endsWith('.ts') &&
      /from 'mutative'/.test(readFileSync(join(srcDir, file), 'utf8'))
  );
});
if (coupled.length) {
  console.error(
    `\nThese packages import Mutative directly: ${coupled
      .map(({ json }) => json.name)
      .join(
        ', '
      )}\nConsume commits through coaction/adapter (applyPatches, producePatches, Patches) instead.`
  );
  process.exit(1);
}

console.log('\nPackage quality checks passed.');
