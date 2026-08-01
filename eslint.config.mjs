import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  {
    ignores: [
      '**/*.mjs',
      '**/*.cjs',
      '**/*.js',
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/third_party/**',
      '**/generated/**',
      '**/vite.config.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-relative-packages': 'error',
    },
  },
  {
    files: ['**/test/**/*.ts', '**/test/**/*.tsx'],
    ...tseslint.configs.disableTypeChecked,
  },
);
