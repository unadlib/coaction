#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const fixtureDir = join(scriptDir, 'fixtures/core-entry-size');
const budgets = JSON.parse(
  readFileSync(join(scriptDir, 'core-entry-size-budgets.json'), 'utf8')
);
const externalDependencies = ['alien-signals', 'data-transport', 'mutative'];
const forbiddenLocalRuntime = [
  'Client transport',
  'Remote action',
  'data-transport',
  'execute-result',
  'full-sync',
  'transportEpoch'
];
const forbiddenAdapterRuntime = [
  'Client transport',
  'data-transport',
  'execute-result',
  'full-sync',
  'Shared transport'
];

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
let failed = false;

for (const name of Object.keys(budgets).sort()) {
  const bundle = await rolldown({
    input: join(fixtureDir, `${name}.ts`),
    external: (id) =>
      externalDependencies.some(
        (dependency) => id === dependency || id.startsWith(`${dependency}/`)
      ),
    platform: 'neutral',
    treeshake: true,
    tsconfig: join(rootDir, 'tsconfig.json')
  });
  try {
    const generated = await bundle.generate({
      format: 'esm',
      minify: true
    });
    const code = generated.output.find(
      (output) => output.type === 'chunk'
    )?.code;
    if (!code) {
      console.error(`FAIL core/${name}: no consumer bundle was generated`);
      failed = true;
      continue;
    }
    const gzipBytes = gzipSync(code).length;
    const { baselineGzipBytes, maxGzipBytes } = budgets[name];
    const delta = gzipBytes - baselineGzipBytes;
    const status = gzipBytes <= maxGzipBytes ? 'OK' : 'FAIL';
    console.log(
      `${status} core/${name} consumer: ${formatBytes(gzipBytes)} / ${formatBytes(maxGzipBytes)} (${delta >= 0 ? '+' : ''}${delta} B)`
    );
    if (gzipBytes > maxGzipBytes) {
      failed = true;
    }
    if (name === 'index') {
      const leaked = forbiddenLocalRuntime.filter((marker) =>
        code.includes(marker)
      );
      if (leaked.length) {
        console.error(
          `FAIL coaction contains shared-runtime markers: ${leaked.join(', ')}`
        );
        failed = true;
      }
    }
    if (name === 'adapter') {
      const leaked = forbiddenAdapterRuntime.filter((marker) =>
        code.includes(marker)
      );
      if (leaked.length) {
        console.error(
          `FAIL core/adapter contains shared-runtime markers: ${leaked.join(', ')}`
        );
        failed = true;
      }
    }
    if (name === 'shared' && !code.includes('full-sync')) {
      console.error(
        'FAIL core/shared fixture did not retain the JSON protocol'
      );
      failed = true;
    }
  } finally {
    await bundle.close();
  }
}

if (failed) {
  process.exit(1);
}

console.log('Core consumer entry isolation passed.');
