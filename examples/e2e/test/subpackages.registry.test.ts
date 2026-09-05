import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packagesDir = join(rootDir, 'packages');
const examplesDir = join(rootDir, 'examples/subpackages');

type PackageExample = {
  packageDir: string;
  packageName: string;
  exampleDir: string;
};

const readPackageExamples = (): PackageExample[] =>
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((packageDir) =>
      existsSync(join(packagesDir, packageDir, 'package.json'))
    )
    .map((packageDir) => {
      const packageJson = JSON.parse(
        readFileSync(join(packagesDir, packageDir, 'package.json'), 'utf8')
      ) as { name: string };
      return {
        packageDir,
        packageName: packageJson.name,
        exampleDir: packageDir === 'core' ? 'core' : packageDir
      };
    })
    .sort((left, right) => left.exampleDir.localeCompare(right.exampleDir));

const packageExamples = readPackageExamples();
const exampleImportFiles = [
  'examples/e2e/browser/subpackageHarness.ts',
  'examples/e2e/test/subpackages.e2e.test.ts',
  'examples/e2e/test/subpackages.integration.test.ts'
];

describe('subpackage example registry', () => {
  test('has one example for every package', () => {
    expect(packageExamples.map((entry) => entry.exampleDir)).toEqual([
      'coaction-history',
      'coaction-jotai',
      'coaction-logger',
      'coaction-mobx',
      'coaction-ng',
      'coaction-persist',
      'coaction-pinia',
      'coaction-react',
      'coaction-redux',
      'coaction-solid',
      'coaction-svelte',
      'coaction-sync',
      'coaction-valtio',
      'coaction-vue',
      'coaction-xstate',
      'coaction-yjs',
      'coaction-zustand',
      'core'
    ]);
  });

  test.each(packageExamples)(
    '$packageName has README and runExample entrypoint',
    ({ exampleDir }) => {
      const examplePath = join(examplesDir, exampleDir);
      expect(existsSync(join(examplePath, 'README.md'))).toBe(true);
      expect(existsSync(join(examplePath, 'index.ts'))).toBe(true);
      expect(readFileSync(join(examplePath, 'index.ts'), 'utf8')).toMatch(
        /\bexport const runExample\b/
      );
    }
  );

  test.each(exampleImportFiles)(
    '%s imports every subpackage example',
    (file) => {
      const source = readFileSync(join(rootDir, file), 'utf8');
      for (const { exampleDir } of packageExamples) {
        expect(source).toContain(`../../subpackages/${exampleDir}`);
      }
    }
  );
});
