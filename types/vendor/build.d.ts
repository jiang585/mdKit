/** 构建工具最小声明（electron.vite.config.ts 类型检查用） */

declare module 'electron-vite' {
  export function defineConfig(config: {
    main?: Record<string, unknown>;
    preload?: Record<string, unknown>;
    renderer?: Record<string, unknown>;
  }): unknown;
  export function externalizeDepsPlugin(): unknown;
}

declare module 'vite' {
  export interface UserConfig {
    [key: string]: unknown;
  }
  export function defineConfig(config: UserConfig): UserConfig;
}

declare module '@vitejs/plugin-react' {
  const plugin: () => unknown;
  export default plugin;
}

declare module 'vitest/config' {
  export function defineConfig(config: Record<string, unknown>): unknown;
}

declare module '@playwright/test' {
  export interface TestInfo {
    [key: string]: unknown;
  }
  export const test: {
    (name: string, fn: (fixtures: Record<string, unknown>) => Promise<void> | void): void;
    describe: (name: string, fn: () => void) => void;
    skip: (condition?: boolean, reason?: string) => void;
    beforeAll: (fn: () => Promise<void> | void) => void;
    afterAll: (fn: () => Promise<void> | void) => void;
  };
  export function expect(actual: unknown): Record<string, (...args: unknown[]) => unknown> & {
    toBe(expected: unknown): void;
    toBeTruthy(): void;
    toContain(expected: unknown): void;
  };
  export function defineConfig(config: Record<string, unknown>): unknown;
  export const _electron: {
    launch(options: { args: string[] }): Promise<{
      firstWindow(): Promise<unknown>;
      close(): Promise<void>;
    }>;
  };
}
