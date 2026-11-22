function findJsdoc(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  return comments.findLast((c) => c.type === 'Block' && c.value.startsWith('*')) || null;
}

function checkFunctionJsdoc(context, jsdoc, reportNode, name, params) {
  if (!jsdoc) {
    context.report({
      node: reportNode,
      message: `Exported function "${name}" must have a JSDoc comment.`,
    });
    return;
  }
  if (params.length > 0 && !/@param\b/.test(jsdoc.value)) {
    context.report({
      node: reportNode,
      message: `Exported function "${name}" JSDoc must document parameters with @param.`,
    });
  }
  if (!/@returns?\b/.test(jsdoc.value)) {
    context.report({
      node: reportNode,
      message: `Exported function "${name}" JSDoc must include @returns.`,
    });
  }
}

const requireExportJsdocRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require JSDoc on exported functions, classes, and arrow/function expressions',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        if (decl.type === 'FunctionDeclaration') {
          const jsdoc = findJsdoc(sourceCode, node);
          const name = decl.id?.name || 'anonymous';
          checkFunctionJsdoc(context, jsdoc, decl.id || decl, name, decl.params);
          return;
        }

        if (decl.type === 'ClassDeclaration') {
          const jsdoc = findJsdoc(sourceCode, node);
          const name = decl.id?.name || 'anonymous';
          if (!jsdoc) {
            context.report({
              node: decl.id || decl,
              message: `Exported class "${name}" must have a JSDoc comment.`,
            });
          }
          return;
        }

        if (decl.type === 'VariableDeclaration') {
          const jsdoc = findJsdoc(sourceCode, node);
          for (const declarator of decl.declarations) {
            const init = declarator.init;
            if (
              init &&
              (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
            ) {
              const name = declarator.id?.name || 'anonymous';
              checkFunctionJsdoc(context, jsdoc, declarator.id || declarator, name, init.params);
            }
          }
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
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-empty': 'error',
      'no-useless-catch': 'error',
      'no-shadow': 'error',
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.js'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['src/utils/logger.js'],
    rules: {
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
