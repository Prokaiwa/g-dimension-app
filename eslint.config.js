import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 9). Scoped to the app source — build output, deps, and the
// SQL/migration tree are ignored. Rule choices below are deliberately pragmatic:
// this codebase has intentional patterns documented in CLAUDE.md (escape-hatch
// casts, leading-underscore throwaways, inline styles), so the noisiest rules are
// relaxed to warnings/off rather than rewriting working code to satisfy a linter.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase', 'public'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Unused locals/args are a warning, and an underscore prefix opts out
      // entirely (matches existing `_now`, `_entered`, `_idx` conventions).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // The intentional `as unknown as T` escape hatches (see CLAUDE.md) rely on
      // explicit any in a couple of Supabase query spots — keep as a warning.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Permit the side-effecting ternary / short-circuit idiom
      // (`cond ? a() : b()`), which the codebase uses for state toggles, while
      // still flagging genuinely dead expressions.
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
    },
  },
)
