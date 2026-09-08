#!/usr/bin/env node
/** Qualify every public entry in a separate, installed tarball consumer. */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(rootDir, 'packages');

const packages = readdirSync(packagesDir)
  .map((dir) => join(packagesDir, dir))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .map((dir) => ({
    dir,
    json: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  }))
  .filter(({ json }) => !json.private);

// An explicit API assertion for each entry prevents empty/broken bundles from
// passing. Manifests drive enumeration, so adding an entry requires a probe.
const entryChecks = {
  coaction: ['create', 'whole'],
  'coaction/shared': ['create'],
  'coaction/adapter': ['onStoreCommit', 'replayStorePatches', 'createBinder'],
  'coaction/derived': ['derive', 'derivePath', 'identity'],
  '@coaction/react': ['create', 'observer'],
  '@coaction/react/shared': ['create', 'observer'],
  '@coaction/history': ['history'],
  '@coaction/jotai': ['bindJotai'],
  '@coaction/logger': ['logger'],
  '@coaction/mobx': ['bindMobx'],
  '@coaction/ng': ['create'],
  '@coaction/persist': ['persist'],
  '@coaction/pinia': ['bindPinia'],
  '@coaction/redux': ['bindRedux'],
  '@coaction/solid': ['create'],
  '@coaction/svelte': ['create'],
  '@coaction/valtio': ['bindValtio'],
  '@coaction/vue': ['create'],
  '@coaction/xstate': ['bindXState'],
  '@coaction/yjs': ['bindYjs'],
  '@coaction/zustand': ['bindZustand'],
  '@coaction/sync': ['sync', 'getSyncApi'],
  '@coaction/sync/crud': ['createCrudSyncAdapter'],
  '@coaction/sync/indexeddb': ['createIndexedDbSyncStorage'],
  '@coaction/sync/supabase': ['createSupabaseSyncAdapter'],
  '@coaction/sync/query': ['createQuerySyncAdapter'],
  '@coaction/sync/firestore': ['createFirestoreSyncAdapter']
};
const run = (command, args, cwd, env = process.env) =>
  execFileSync(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
const detail = (error) =>
  [error.stdout, error.stderr]
    .filter(Boolean)
    .map((value) => value.toString())
    .join('\n')
    .trim() || error.message;

const scratch = mkdtempSync(join(tmpdir(), 'coaction-pack-'));
let failed = false;
const fail = (message) => {
  failed = true;
  console.error(`FAIL ${message}`);
};

try {
  console.log(`Packing ${packages.length} packages into ${scratch}`);
  const tarballs = new Map();
  for (const { dir, json } of packages) {
    const output = execFileSync(
      'npm',
      ['pack', '--pack-destination', scratch],
      {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
      .toString()
      .trim()
      .split('\n')
      .pop();
    tarballs.set(json.name, join(scratch, output));
  }

  const overrides = Object.fromEntries(
    [...tarballs].map(([name, file]) => [name, `file:${file}`])
  );
  let entryCount = 0;
  for (const { json } of packages) {
    const project = join(scratch, json.name.replace(/[^a-z0-9-]/gi, '_'));
    mkdirSync(project);
    // Only this package and its declared workspace peers are direct runtime
    // dependencies. npm supplies external peers from their declared ranges.
    const dependencies = { [json.name]: overrides[json.name] };
    for (const name of Object.keys(json.peerDependencies ?? {})) {
      if (tarballs.has(name)) dependencies[name] = overrides[name];
    }
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify(
        {
          name: 'coaction-pack-consumer',
          version: '0.0.0',
          private: true,
          type: 'module',
          dependencies,
          overrides,
          devDependencies: { typescript: '^5.9.3' }
        },
        null,
        2
      )
    );
    console.log(`Installing isolated consumer for ${json.name}`);
    try {
      run(
        'npm',
        ['install', '--no-audit', '--no-fund', '--loglevel=error'],
        project
      );
      const entries = Object.keys(json.exports)
        .filter((key) => key !== './package.json')
        .map((key) => (key === '.' ? json.name : json.name + key.slice(1)));
      const probes = [];
      for (const entry of entries) {
        const names = entryChecks[entry];
        if (!names?.length) throw new Error(`Missing API probe for ${entry}`);
        entryCount += 1;
        for (const format of ['esm', 'cjs']) {
          const extension = format === 'esm' ? 'mjs' : 'cjs';
          const load =
            format === 'esm'
              ? `import * as mod from '${entry}';`
              : `const mod = require('${entry}');`;
          writeFileSync(
            join(project, `probe.${extension}`),
            `${load}
            for (const name of ${JSON.stringify(names)}) {
              if (typeof mod[name] !== 'function') throw new Error('${entry}: missing ' + name);
            }
          `
          );
          run('node', [`probe.${extension}`], project);
          const typesFile = `probe-${probes.length}.${format === 'esm' ? 'mts' : 'cts'}`;
          probes.push(typesFile);
          const importTypes =
            format === 'esm'
              ? `import * as mod from '${entry}';`
              : `import mod = require('${entry}');`;
          writeFileSync(
            join(project, typesFile),
            `${importTypes}
            ${names.map((name) => `const ${name}: Function = mod.${name};`).join('\n')}
            ${
              names.includes('create')
                ? `
              const store = mod.create(() => ({ count: 0 }));
              const count: number = store.getState().count;
              // @ts-expect-error Installed declarations must retain state inference.
              const invalid: string = store.getState().count;
              store.destroy();
            `
                : ''
            }
          `
          );
        }
        console.log(`  ok    import + require ${entry}`);
      }
      for (const [module, moduleResolution, files] of [
        ['NodeNext', 'NodeNext', probes],
        ['ESNext', 'Bundler', probes.filter((file) => file.endsWith('.mts'))]
      ]) {
        writeFileSync(
          join(project, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module,
              moduleResolution,
              strict: true,
              noEmit: true,
              skipLibCheck: false
            },
            files
          })
        );
        run(
          'node',
          ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'],
          project
        );
        console.log(`  ok    installed declarations (${moduleResolution})`);
      }
      if (json.name === '@coaction/history') {
        for (const extension of ['mjs', 'cjs']) {
          const imports =
            extension === 'mjs'
              ? `import { create } from 'coaction'; import { onStoreCommit } from 'coaction/adapter'; import { history } from '@coaction/history';`
              : `const { create } = require('coaction'); const { onStoreCommit } = require('coaction/adapter'); const { history } = require('@coaction/history');`;
          writeFileSync(
            join(project, `use.${extension}`),
            `${imports}
            const store = create((set) => ({ count: 0, left: null, right: null,
              increment() { set(() => { this.count += 1; }); }
            }), { middlewares: [history()] });
            const commits = [];
            onStoreCommit(store, (commit) => commits.push(commit));
            store.getState().increment();
            if (store.getState().count !== 1 || commits.length !== 1) throw new Error('commit');
            if (!store.history.undo() || store.getState().count !== 0) throw new Error('undo');
            const node = {}; node.self = node;
            let calls = 0;
            store.setState((draft) => { calls++; draft.left = node; draft.right = node; });
            if (calls !== 1) throw new Error('history recipe retried');
            if (!store.history.undo() || store.getPureState().left !== null || store.getPureState().right !== null) throw new Error('graph undo');
            if (!store.history.redo()) throw new Error('graph redo');
            const restored = store.getPureState();
            if (restored.left !== restored.right || restored.left.self !== restored.left) throw new Error('history graph topology');
            store.destroy();
          `
          );
          for (const NODE_ENV of ['development', 'production']) {
            run('node', [`use.${extension}`], project, {
              ...process.env,
              NODE_ENV
            });
          }
        }
        console.log(
          '  ok    installed store, commits and graph history (ESM + CJS, development + production)'
        );
      }
      if (json.name === 'coaction') {
        for (const extension of ['mjs', 'cjs']) {
          const imports =
            extension === 'mjs'
              ? `import assert from 'node:assert/strict'; import { create } from 'coaction'; import { derive, derivePath, identity } from 'coaction/derived'; import { onStoreCommit, onStoreCommitPrepare, applyPatches } from 'coaction/adapter';`
              : `const assert = require('node:assert/strict'); const { create } = require('coaction'); const { derive, derivePath, identity } = require('coaction/derived'); const { onStoreCommit, onStoreCommitPrepare, applyPatches } = require('coaction/adapter');`;
          writeFileSync(
            join(project, `graph.${extension}`),
            `${imports}
            {
              const store = create({ user: { name: 'Ada', age: 1 } });
              let calls = 0;
              const name = derive(store, s => { calls++; return s.user.name; }, { deep: true });
              const age = derivePath(store, ['user', 'age']);
              const user = derive(store, s => identity(s.user), { deep: true });
              assert.equal(name(), 'Ada');
              assert.equal(age(), 1);
              assert.equal(user(), store.getState().user);
              store.setState(s => { s.user.age++; });
              assert.equal(name(), 'Ada');
              assert.equal(calls, 1);
              assert.equal(age(), 2);
              assert.equal(user(), store.getState().user);
              assert.throws(() => store.setState(s => { s.user.name = 'draft'; assert.equal(name(), 'draft'); throw new Error('rollback'); }), /rollback/);
              assert.equal(name(), 'Ada');
              store.setState(s => { s.user.name = 'Lin'; });
              assert.equal(name(), 'Lin');
              name.dispose();
              assert.throws(() => name(), /disposed/);
              store.destroy();
              assert.throws(() => age(), /disposed/);
            }
            for (const update of ['object', 'recipe', 'root']) {
              for (const mode of ['unwatched', 'listener', 'prepare', 'getter']) {
                const node = {}; node.self = node;
                const store = create(() => ({ left: null, right: null,
                  get linked() { return this.left !== null && this.left === this.right && this.left.self === this.left; }
                }));
                const before = store.getPureState();
                const commits = [];
                if (mode === 'listener') onStoreCommit(store, (commit) => commits.push(commit));
                if (mode === 'prepare') onStoreCommitPrepare(store, (commit) => { commits.push(commit); return true; });
                if (mode === 'getter') assert.equal(store.getState().linked, false);
                const replacement = { left: node, right: node };
                if (update === 'object') store.setState(replacement);
                if (update === 'root') store.apply(replacement);
                if (update === 'recipe') {
                  let calls = 0;
                  const failure = new Error('application failure');
                  assert.throws(() => store.setState((draft) => {
                    calls++; draft.left = node; throw failure;
                  }), (error) => error === failure);
                  assert.equal(calls, 1);
                  assert.equal(store.getPureState(), before);
                  assert.equal(commits.length, 0);
                  store.setState((draft) => { calls++; draft.left = node; draft.right = node; });
                  assert.equal(calls, 2);
                }
                const after = store.getPureState();
                assert.equal(after.left, after.right);
                assert.equal(after.left.self, after.left);
                assert.equal(store.getState().linked, true);
                assert.equal(before.left, null);
                assert.equal(before.right, null);
                // Prepare hooks belong to recipe/object production, not direct apply.
                if (mode === 'listener' || (mode === 'prepare' && update !== 'root')) {
                  assert.equal(commits.length, 1);
                  const replayed = applyPatches(before, commits[0].patches);
                  assert.equal(replayed.left, replayed.right);
                  assert.equal(replayed.left.self, replayed.left);
                  const restored = applyPatches(after, commits[0].inversePatches);
                  assert.equal(restored.left, null);
                  assert.equal(restored.right, null);
                }
                store.destroy();
              }
            }
          `
          );
          for (const NODE_ENV of ['development', 'production']) {
            run('node', [`graph.${extension}`], project, {
              ...process.env,
              NODE_ENV
            });
          }
        }
        console.log(
          `  ok    installed graph replacements and replay (ESM + CJS, development + production; Mutative ${run('node', ['-p', "require('mutative/package.json').version"], project).toString().trim()})`
        );
      }
    } catch (error) {
      fail(`${json.name}: ${detail(error)}`);
    }
  }
  console.log(
    `Checked ${entryCount} public entries across ${packages.length} isolated consumers.`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log('Packed runtime and TypeScript consumer checks passed.');
