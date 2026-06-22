import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Public-facing errors intentionally read untyped JSON bodies as `unknown`;
      // allow the occasional explicit cast at those boundaries.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
