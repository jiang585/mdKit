/**
 * ESLint 配置（开发规范 §4.3：CI 必须配置 import/no-cycle）
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'import', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'import/resolver': {
      typescript: { project: ['tsconfig.node.json', 'tsconfig.web.json'] },
      node: { extensions: ['.ts', '.tsx', '.js'] },
    },
  },
  env: { es2022: true, node: true, browser: true },
  rules: {
    // 模块低耦合硬约束
    'import/no-cycle': ['error', { maxDepth: 6 }],
    'import/no-self-import': 'error',
    // 禁止跨模块引用私有实现（只允许经由模块入口 index.ts）
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@renderer/editor/*', '!@renderer/editor/index', '!@renderer/editor/EditorPanel'], message: '编辑核心模块仅可通过入口 index.ts 引用' },
          { group: ['@renderer/preview/*', '!@renderer/preview/index'], message: '渲染管线模块仅可通过入口 index.ts 引用' },
          { group: ['@renderer/theme/*', '!@renderer/theme/index'], message: '主题引擎模块仅可通过入口 index.ts 引用' },
          { group: ['@renderer/layout/*', '!@renderer/layout/index'], message: '布局管理模块仅可通过入口 index.ts 引用' },
          { group: ['@renderer/export/*', '!@renderer/export/index'], message: '导出服务模块仅可通过入口 index.ts 引用' },
          { group: ['@renderer/ai/*', '!@renderer/ai/index'], message: 'AI 桥接层模块仅可通过入口 index.ts 引用' },
        ],
      },
    ],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      files: ['src/main/**/*', 'src/preload/**/*', 'scripts/**/*'],
      env: { node: true, browser: false },
      rules: { 'no-console': 'off' },
    },
    {
      files: ['tests/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
        'no-restricted-imports': 'off',
      },
    },
  ],
  ignorePatterns: ['out', 'dist', 'release', 'node_modules', 'coverage', '*.cjs', 'types/vendor'],
};
