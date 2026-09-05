import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Tauri 2 前端构建：root 的 index.html → src/renderer/main.tsx。
 * - 渲染管线 Worker 由 Vite 原生 `new Worker(new URL(...))` 语法自动分包；
 * - mermaid / katex 单独分包（懒加载，不进首屏）；
 * - `@renderer` / `@shared` 别名与原 Electron 版保持一致。
 */
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      // Vite's browser condition picks a DOM decoder that crashes inside Web Workers.
      'decode-named-character-reference': resolve(
        __dirname,
        'node_modules/decode-named-character-reference/index.js',
      ),
      'hast-util-from-html-isomorphic': resolve(
        __dirname,
        'node_modules/hast-util-from-html-isomorphic/index.js',
      ),
    },
  },
  build: {
    target: 'chrome110',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // 首屏不加载 mermaid（按需 import 后单独成块）
          if (id.includes('node_modules/mermaid')) return 'mermaid';
          if (id.includes('node_modules/katex')) return 'katex';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
