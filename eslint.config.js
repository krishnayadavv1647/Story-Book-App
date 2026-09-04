import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      // `ignoreRestSiblings` allows the omit-a-key idiom: `const { drop, ...rest }`.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // console is the wrong channel on the server — the pino logger redacts.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-duplicate-imports': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  {
    files: ['client/**/*.{js,jsx}'],
    plugins: { react },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2023 },
    },
    rules: {
      // Without this, every component and router symbol used only inside JSX
      // reads as an unused import to the base no-unused-vars rule.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',
    },
  },

  {
    files: ['**/*.test.{js,jsx}', '**/__tests__/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
