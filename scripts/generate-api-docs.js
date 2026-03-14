const { execFileSync } = require('node:child_process');

const run = (command, args) => {
  execFileSync(command, args, {
    stdio: 'inherit'
  });
};

run('pnpm', ['exec', 'typedoc', '--options', 'typedoc.core.json']);
run('pnpm', [
  'exec',
  'prettier',
  '--write',
  'docs/api/core/**/*.md',
  'docs/api/core/index.md',
  'docs/api/core/modules.md'
]);
