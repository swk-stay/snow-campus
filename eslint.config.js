import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-ssr'] },
  js.configs.recommended,
  tseslint.configs.recommended,
);
