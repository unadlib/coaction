import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

const codeFiles = ['**/*.{js,mjs,cjs,ts,tsx}'];
const browserFiles = [
  'examples/**/src/**/*.{js,mjs,cjs,ts,tsx}',
  'examples/e2e/browser/**/*.{js,mjs,cjs,ts,tsx}'
];
const testFiles = [
  '**/test/**/*.{js,mjs,cjs,ts,tsx}',
  'examples/e2e/test/**/*.{js,mjs,cjs,ts,tsx}',
  'vitest.setup.js'
];
const nodeFiles = [
  '*.config.{js,mjs,cjs,ts}',
  'babel.config.js',
  'eslint.config.mjs',
  'playwright.config.ts',
  'scripts/**/*.{js,mjs,cjs,ts}',
  'vitest.config.mjs'
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**'
    ]
  },
  {
    files: codeFiles,
    languageOptions: {
      ecmaVersion: 'latest'
    },
    rules: {
      'prefer-rest-params': 'off',
      'prefer-spread': 'off'
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, prettierConfig],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      'prefer-rest-params': 'off',
      'prefer-spread': 'off'
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettierConfig
    ],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^T$'
        }
      ],
      'prefer-rest-params': 'off',
      'prefer-spread': 'off'
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-var': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    files: browserFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.worker
      }
    }
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest
      }
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'prefer-spread': 'off'
    }
  },
  {
    files: nodeFiles,
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off'
    }
  }
);
