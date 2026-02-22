'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const changesetBin = require.resolve('@changesets/cli/bin.js');

const args = process.argv.slice(2);

const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit'
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (args[0] === 'version') {
  run('node', [path.join(__dirname, 'validate-changesets.js')]);
  run(process.execPath, [changesetBin, 'version', ...args.slice(1)]);
  run('node', [path.join(__dirname, 'bump-peer-dep-ranges.js')]);
  process.exit(0);
}

run(process.execPath, [changesetBin, ...args]);
