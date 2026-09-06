#!/usr/bin/env node
/**
 * Install the packed tarballs into an empty project and use them.
 *
 * Everything else checks the repository: `publint` and `attw` read the package
 * manifests, the tests import source through vitest aliases, and the entry
 * interop check loads `dist` by path. None of that exercises what a consumer
 * actually gets -- whether `files` ships the built output, whether the
 * `exports` map resolves under Node's own algorithm, whether the types resolve
 * from the installed location, or whether a dependency that should have been
 * declared happens to be present in the monorepo and missing on its own.
 *
 * This packs, installs into a scratch directory outside the workspace, and
 * imports every published entry through Node -- as ESM and as CJS -- then makes
 * a store and reads it, so a broken entry fails as a broken entry rather than
 * as a missing file.
 */
import { execFileSync } from 'node:child_process';
import {
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

/** Entries to import from an installed package, with what each must export. */
const entryChecks = {
  coaction: [
    ['coaction', ['create', 'whole']],
    ['coaction/shared', ['create']],
    [
      'coaction/adapter',
      ['onStoreCommit', 'replayStorePatches', 'createBinder']
    ]
  ],
  '@coaction/react': [['@coaction/react', ['create', 'observer']]],
  '@coaction/history': [['@coaction/history', ['history']]],
  '@coaction/sync': [
    ['@coaction/sync', ['sync', 'getSyncApi']],
    ['@coaction/sync/crud', []],
    ['@coaction/sync/indexeddb', []]
  ],
  '@coaction/logger': [['@coaction/logger', ['logger']]],
  '@coaction/persist': [['@coaction/persist', ['persist']]]
};

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

  const project = join(scratch, 'consumer');
  execFileSync('mkdir', ['-p', project]);
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify(
      {
        name: 'coaction-pack-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          [...tarballs].map(([name, file]) => [name, `file:${file}`])
        )
      },
      null,
      2
    )
  );

  console.log('Installing the tarballs');
  execFileSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--loglevel=error'],
    {
      cwd: project,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  for (const [packageName, entries] of Object.entries(entryChecks)) {
    for (const [entry, exported] of entries) {
      const esm = `
        import * as mod from '${entry}';
        const missing = ${JSON.stringify(exported)}.filter((name) => typeof mod[name] === 'undefined');
        if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1); }
      `;
      writeFileSync(join(project, 'probe.mjs'), esm);
      try {
        execFileSync('node', ['probe.mjs'], {
          cwd: project,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        console.log(`  ok    import ${entry}`);
      } catch (error) {
        fail(
          `import ${entry}: ${(error.stderr?.toString() || error.message).trim().split('\n')[0]}`
        );
      }
      const cjs = `
        const mod = require('${entry}');
        const missing = ${JSON.stringify(exported)}.filter((name) => typeof mod[name] === 'undefined');
        if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1); }
      `;
      writeFileSync(join(project, 'probe.cjs'), cjs);
      try {
        execFileSync('node', ['probe.cjs'], {
          cwd: project,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        console.log(`  ok    require ${entry}`);
      } catch (error) {
        fail(
          `require ${entry}: ${(error.stderr?.toString() || error.message).trim().split('\n')[0]}`
        );
      }
    }
  }

  // A store built and read from the installed packages, so the entries are
  // checked for working rather than only for resolving.
  writeFileSync(
    join(project, 'use.mjs'),
    `
      import { create } from 'coaction';
      import { onStoreCommit } from 'coaction/adapter';
      import { history } from '@coaction/history';
      const store = create((set) => ({
        count: 0,
        increment() { set(() => { this.count += 1; }); }
      }), { middlewares: [history()] });
      const commits = [];
      onStoreCommit(store, (commit) => commits.push(commit));
      store.getState().increment();
      if (store.getState().count !== 1) { console.error('state'); process.exit(1); }
      if (commits.length !== 1) { console.error('commits: ' + commits.length); process.exit(1); }
      if (!store.history.undo()) { console.error('undo'); process.exit(1); }
      if (store.getState().count !== 0) { console.error('undone'); process.exit(1); }
      store.destroy();
    `
  );
  try {
    execFileSync('node', ['use.mjs'], {
      cwd: project,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    console.log('  ok    a store built from the installed packages works');
  } catch (error) {
    fail(
      `using the installed packages: ${(error.stderr?.toString() || error.message).trim().split('\n').slice(0, 3).join(' ')}`
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  console.error('\nPacked artifact check failed.');
  process.exit(1);
}
console.log('\nPacked artifacts install and work.');
