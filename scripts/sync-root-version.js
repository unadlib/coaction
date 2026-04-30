'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const rootPackagePath = path.join(rootDir, 'package.json');
const corePackagePath = path.join(rootDir, 'packages/core/package.json');

const readPackageJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writePackageJson = (filePath, packageJson) => {
  fs.writeFileSync(filePath, `${JSON.stringify(packageJson, null, 2)}\n`);
};

const rootPackage = readPackageJson(rootPackagePath);
const corePackage = readPackageJson(corePackagePath);

if (rootPackage.version === corePackage.version) {
  console.log(`Root package version already ${rootPackage.version}`);
  process.exit(0);
}

rootPackage.version = corePackage.version;
writePackageJson(rootPackagePath, rootPackage);
console.log(`Updated root package version to ${corePackage.version}`);
