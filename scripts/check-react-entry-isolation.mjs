#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const fixtureDir = join(scriptDir, 'fixtures/react-entry-size');
const externalDependencies = [
  'alien-signals',
  'data-transport',
  'mutative',
  'react',
  'use-sync-external-store'
];
const sharedRuntimeMarkers = [
  'Client transport',
  'data-transport',
  'execute-result',
  'full-sync',
  'transportEpoch'
];

const build = async (name) => {
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
    const generated = await bundle.generate({ format: 'esm', minify: true });
    const code = generated.output.find(
      (output) => output.type === 'chunk'
    )?.code;
    if (!code) throw new Error(`No bundle generated for react/${name}`);
    return code;
  } finally {
    await bundle.close();
  }
};

// The default entry is local, and that is the property worth guarding: an
// import added to `src/index.ts` that reaches the transport runtime would put
// it back into every bundle that imports React state.
const localOnlyEntries = ['index', 'local'];
const sizes = {};
for (const name of localOnlyEntries) {
  const code = await build(name);
  sizes[name] = gzipSync(code).length;
  const leaked = sharedRuntimeMarkers.filter((marker) => code.includes(marker));
  if (leaked.length) {
    const label =
      name === 'index' ? '@coaction/react' : `@coaction/react/${name}`;
    throw new Error(
      `${label} retained shared-runtime markers: ${leaked.join(', ')}`
    );
  }
}

const sharedCode = await build('shared');
sizes.shared = gzipSync(sharedCode).length;
if (!sharedCode.includes('full-sync')) {
  throw new Error(
    '@coaction/react/shared did not retain the shared protocol runtime.'
  );
}
if (sizes.index !== sizes.local) {
  throw new Error(
    `@coaction/react and @coaction/react/local must be the same runtime (${sizes.index} vs ${sizes.local} bytes gzip).`
  );
}

const kib = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
console.log(
  `React entry isolation passed (default/local ${kib(sizes.index)} gzip, shared ${kib(sizes.shared)} gzip).`
);
