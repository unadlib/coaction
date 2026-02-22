'use strict';

const fs = require('fs');
const path = require('path');
const { getPackagesSync } = require('@manypkg/get-packages');

const rootDir = path.join(__dirname, '..');
const changesetDir = path.join(rootDir, '.changeset');

const packages = getPackagesSync(rootDir)
  .packages.map((pkg) => pkg.packageJson.name)
  .filter((name) => name === 'coaction' || name.startsWith('@coaction/'))
  .sort();

const now = new Date();
const filename = `minor-all-${now
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z')
  .toLowerCase()}.md`;

const frontmatter = [
  '---',
  ...packages.map((name) => `"${name}": minor`),
  '---',
  '',
  'Release all coaction packages with a minor bump.',
  ''
].join('\n');

const filePath = path.join(changesetDir, filename);
fs.writeFileSync(filePath, frontmatter, 'utf8');

console.log(`Created ${path.relative(rootDir, filePath)}`);
