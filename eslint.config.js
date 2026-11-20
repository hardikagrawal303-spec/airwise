const requireExportJsdocRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require JSDoc with @param and @returns tags on exported functions',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl || decl.type !== 'FunctionDeclaration') return;
        const comments = sourceCode.getCommentsBefore(node);
        const jsdoc = comments.findLast((c) => c.type === 'Block' && c.value.startsWith('*'));
        const name = decl.id?.name || 'anonymous';
        if (!jsdoc) {
          context.report({
            node: decl.id || decl,
            message: `Exported function "${name}" must have a JSDoc comment.`,
          });
          return;
        }
        if (decl.params.length > 0 && !/@param\b/.test(jsdoc.value)) {
          context.report({
            node: decl.id || decl,
            message: `Exported function "${name}" JSDoc must document parameters with @param.`,
          });
        }
        if (!/@returns?\b/.test(jsdoc.value)) {
          context.report({
            node: decl.id || decl,
            message: `Exported function "${name}" JSDoc must include @returns.`,
          });
        }
      },
    };
  },
};

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'build/**', '.playwright-cli/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.js', 'public/js/**/*.js'],
    plugins: {
      local: {
        rules: {
          'require-export-jsdoc': requireExportJsdocRule,
        },
      },
    },
    rules: {
      'local/require-export-jsdoc': 'error',
    },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        Event: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
