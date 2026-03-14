const { execFileSync } = require('node:child_process');

const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error(
    'Usage: node ./scripts/check-clean-path.js <path> [...morePaths]'
  );
  process.exit(1);
}

const output = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', ...paths],
  {
    encoding: 'utf8'
  }
).trim();

if (output.length > 0) {
  console.error(`Generated files are out of date for: ${paths.join(', ')}`);
  console.error(output);
  process.exit(1);
}
