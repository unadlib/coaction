#!/usr/bin/env node
/**
 * Verify that the published entry bundles still speak one runtime protocol.
 *
 * `coaction`, `coaction/shared` and `coaction/adapter` are
 * separate bundles with code splitting off. Any registry held in a module-level
 * variable therefore becomes one copy per bundle, and a value that crosses an
 * entry boundary stops being recognised -- which is precisely what the React
 * binding does when it tracks an object-valued selector result from a store the
 * application created with `coaction`.
 *
 * The unit tests cannot catch this. They alias every entry to the same source
 * file, so a single module instance is shared and the registries agree. This
 * script imports the built `dist` output instead, which is what an application
 * installs.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'packages/core/dist');

const load = async (name) => {
  const file = join(distDir, `${name}.mjs`);
  if (!existsSync(file)) {
    throw new Error(
      `Entry runtime interop check requires a built core package. Run pnpm build first (missing ${file}).`
    );
  }
  return import(pathToFileURL(file).href);
};

const [index, shared, adapter] = await Promise.all([
  load('index'),
  load('shared'),
  load('adapter')
]);

const failures = [];
const check = (label, condition, detail) => {
  if (!condition) failures.push(`${label}: ${detail}`);
};

for (const [entryName, entry] of [
  ['coaction', index],
  ['coaction/shared', shared]
]) {
  const store = entry.create(() => ({ user: { name: 'Michael' } }));
  const value = store.getState().user;

  // The adapter must recognise a public value produced by another entry, or
  // object-valued selector results silently lose their dependency.
  check(
    `${entryName} -> coaction/adapter`,
    adapter.trackReadonlyStateValue(value) === true,
    'trackReadonlyStateValue() did not recognise the public state object'
  );
  check(
    `${entryName} -> coaction/adapter`,
    typeof adapter.getReadonlyStateValueVersion(value) === 'number',
    'getReadonlyStateValueVersion() returned no version'
  );

  // A tracker from the adapter must collect dependencies from that store.
  const tracker = adapter.createReactiveTracker();
  tracker.track(() => store.getState().user.name);
  check(
    `${entryName} -> coaction/adapter`,
    tracker.hasDependencies() === true,
    'a tracker from the adapter recorded no dependency'
  );
  tracker.dispose();

  store.destroy();
}

// One source object must map to one readonly proxy no matter which entry reads
// it, or reference identity stops holding across a boundary.
{
  const store = index.create(() => ({ items: [{ id: 'a' }] }));
  const first = store.getState().items;
  const second = store.getState().items;
  check(
    'coaction',
    first === second,
    'repeated reads produced different readonly proxies'
  );
  store.destroy();
}

if (failures.length) {
  console.error('Entry runtime interop FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    '\nA registry that must be shared across entries is module-local. See packages/core/src/sharedRegistry.ts.'
  );
  process.exit(1);
}

console.log(
  'Entry runtime interop passed (index and shared both interoperate with adapter).'
);
