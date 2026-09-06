#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getPackagesSync } = require('@manypkg/get-packages');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publishDir = join(rootDir, '.publish');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const force = args.includes('--force');
const publishArgs = args.filter((arg) => arg !== '--force');

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: {
      ...process.env,
      ...options.env
    }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : '';
    throw new Error(
      `${command} ${commandArgs.join(' ')} failed with code ${
        result.status ?? 1
      }${stderr}`
    );
  }

  return result.stdout ?? '';
};

const isPublished = (name, version) => {
  const result = spawnSync(
    'npm',
    ['view', `${name}@${version}`, 'version', '--json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  return result.status === 0 && result.stdout.trim().length > 0;
};

const pack = (pkg) => {
  const stdout = run(
    'pnpm',
    ['--dir', pkg.dir, 'pack', '--pack-destination', publishDir, '--json'],
    { capture: true }
  );

  const parsed = JSON.parse(stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const filename = entry.filename ?? entry.name;

  if (!filename) {
    throw new Error(
      `Unable to determine tarball path for ${pkg.packageJson.name}`
    );
  }

  return isAbsolute(filename) ? filename : join(publishDir, filename);
};

rmSync(publishDir, { recursive: true, force: true });
mkdirSync(publishDir, { recursive: true });

const packages = getPackagesSync(rootDir)
  .packages.filter(({ packageJson }) => {
    const name = packageJson.name;
    return name === 'coaction' || name.startsWith('@coaction/');
  })
  .sort((a, b) => {
    if (a.packageJson.name === 'coaction') {
      return -1;
    }
    if (b.packageJson.name === 'coaction') {
      return 1;
    }
    return a.packageJson.name.localeCompare(b.packageJson.name);
  });

/**
 * The dist-tag a version belongs under.
 *
 * `npm publish` writes `latest` unless told otherwise, whatever the version
 * says -- so publishing `4.0.0-rc.1` without a `--tag` would put a release
 * candidate in front of everyone running `npm install coaction`. A version with
 * a prerelease identifier gets that identifier as its tag instead, and an
 * explicit `--tag` still wins.
 */
const distTagFor = (version) => {
  const prerelease = /-([0-9A-Za-z-]+)/.exec(version);
  return prerelease ? prerelease[1] : 'latest';
};

const taggedExplicitly = publishArgs.some(
  (arg) => arg === '--tag' || arg.startsWith('--tag=')
);

for (const pkg of packages) {
  const { name, version } = pkg.packageJson;

  if (!force && isPublished(name, version)) {
    console.log(`${name}@${version} is already published; skipping.`);
    continue;
  }

  const tarball = pack(pkg);
  const tag = distTagFor(version);
  console.log(
    `Publishing ${name}@${version} under "${tag}" from ${relative(rootDir, tarball)}`
  );

  const tagArgs = taggedExplicitly ? [] : ['--tag', tag];
  run(
    'npm',
    ['publish', tarball, '--access', 'public', ...tagArgs, ...publishArgs],
    {
      env: {
        CI: 'true'
      }
    }
  );
}
