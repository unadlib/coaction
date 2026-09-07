#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const targets = process.argv.slice(2);
const baseConfig = ts.getParsedCommandLineOfConfigFile(
  join(rootDir, 'tsconfig.typecheck.json'),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      );
    }
  }
);
if (baseConfig.errors.length) {
  throw new Error(
    baseConfig.errors
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      )
      .join('\n')
  );
}

if (targets.length === 0) {
  console.error(
    'Usage: pnpm test:history:travels <version-or-package> [...moreTargets]'
  );
  process.exit(1);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with status ${result.status}`
    );
  }
};

const resolveRuntimeEntry = (packageJson) => {
  const runtimeEntry =
    packageJson.module ??
    packageJson.exports?.['.']?.default?.default ??
    packageJson.main;
  if (typeof runtimeEntry !== 'string') {
    throw new Error('travels does not declare an ESM runtime entry point');
  }
  return runtimeEntry;
};

for (const target of targets) {
  const tempDir = mkdtempSync(join(rootDir, '.travels-compat-'));
  try {
    writeFileSync(
      join(tempDir, 'package.json'),
      `${JSON.stringify({ private: true }, null, 2)}\n`
    );
    run(npmBin, [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--prefix',
      tempDir,
      target
    ]);

    const travelsDir = join(tempDir, 'node_modules', 'travels');
    const packageJson = JSON.parse(
      readFileSync(join(travelsDir, 'package.json'), 'utf8')
    );
    const typesEntry = packageJson.types ?? packageJson.typings;
    if (typeof typesEntry !== 'string') {
      throw new Error(`${target} does not declare a TypeScript entry point`);
    }
    const runtimeEntry = resolveRuntimeEntry(packageJson);

    const tsconfigPath = join(tempDir, 'tsconfig.json');
    writeFileSync(
      tsconfigPath,
      `${JSON.stringify(
        {
          extends: join(rootDir, 'tsconfig.typecheck.json'),
          compilerOptions: {
            baseUrl: rootDir,
            paths: {
              // TypeScript replaces, rather than merges, inherited paths.
              // Keep every workspace source alias while substituting Travels.
              ...baseConfig.options.paths,
              travels: [resolve(travelsDir, typesEntry)]
            }
          }
        },
        null,
        2
      )}\n`
    );

    console.log(`\n== @coaction/history with ${target} ==`);
    run(pnpmBin, ['exec', 'tsc', '--noEmit', '--project', tsconfigPath]);

    const vitestConfigPath = join(tempDir, 'vitest.config.mjs');
    writeFileSync(
      vitestConfigPath,
      `import baseConfig from ${JSON.stringify(
        pathToFileURL(join(rootDir, 'vitest.config.mjs')).href
      )};

export default {
  ...baseConfig,
  root: ${JSON.stringify(rootDir)},
  resolve: {
    ...baseConfig.resolve,
    alias: {
      ...baseConfig.resolve?.alias,
      travels: ${JSON.stringify(resolve(travelsDir, runtimeEntry))}
    }
  },
  test: {
    ...baseConfig.test,
    coverage: {
      ...baseConfig.test?.coverage,
      enabled: false
    },
    include: ['packages/coaction-history/test/**/*.test.ts']
  }
};
`
    );
    run(pnpmBin, ['exec', 'vitest', 'run', '--config', vitestConfigPath]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log('\nTravels compatibility typechecks and tests passed.');
