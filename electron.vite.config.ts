import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * electron-vite 三段式构建：main / preload / renderer。
 * - main、preload 以 Node(Electron) 为目标，外部化依赖；
 * - renderer 为纯 Web 目标（sandbox 渲染进程，无 Node 集成）；
 * - 渲染管线 Worker 由 Vite 原生 `new Worker(new URL(...))` 语法自动分包；
 * - P1/P2 大块能力（mermaid、AI 面板）通过动态 import 延迟加载，不进首屏。
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks(id: string) {
            // 首屏不加载 mermaid（P2 独立插件，按需 import 后单独成块）
            if (id.includes('node_modules/mermaid')) return 'mermaid';
            if (id.includes('node_modules/katex')) return 'katex';
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 1500,
    },
  },
});
