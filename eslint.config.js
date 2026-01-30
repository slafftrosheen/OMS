import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
        '.svelte-kit/',
        'build/',
        '.vercel/',
        'dist/',
        'node_modules/',
        'static/*.js'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceWorker
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  }
);
