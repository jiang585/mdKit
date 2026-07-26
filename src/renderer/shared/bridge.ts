/**
 * 主进程桥接的类型化访问点。
 * Electron 环境使用 preload 暴露的 window.mdkit；
 * 浏览器/测试环境自动降级为内存 Mock（供组件测试与浏览器 E2E 使用）。
 */
import type { UserConfig, UserConfigPatch } from '@shared/config-schema';
import { defaultUserConfig, mergeConfig } from '@shared/config-schema';
import type { DraftEntry, OpenedFile, RecentFile } from '@shared/ipc-contract';

type Unsubscribe = () => void;

export interface Bridge {
  file: {
    openDialog(): Promise<OpenedFile | null>;
    pathForFile(file: File): string;
    openDropped(path: string): Promise<OpenedFile>;
    read(path: string): Promise<OpenedFile>;
    save(path: string, content: string): Promise<{ ok: boolean }>;
    saveAs(defaultName: string, content: string): Promise<{ path: string; name: string } | null>;
    recentList(): Promise<RecentFile[]>;
    recentClear(): Promise<{ ok: boolean }>;
  };
  config: {
    get(): Promise<UserConfig>;
    patch(patch: UserConfigPatch): Promise<UserConfig>;
  };
  theme: {
    importFile(): Promise<{ json: string } | { error: string } | null>;
    listCustom(): Promise<string[]>;
  };
  exporter: {
    html(defaultName: string, html: string): Promise<{ path: string } | null>;
    pdf(defaultName: string, html: string): Promise<{ path: string } | null>;
  };
  shell: { openExternal(url: string): Promise<{ ok: boolean }> };
  window: { setTitle(title: string, documentPath: string | null, dirty: boolean): Promise<{ ok: boolean }> };
  drafts: {
    save(tabId: string, path: string | null, content: string): Promise<{ ok: boolean }>;
    clear(tabId: string): Promise<{ ok: boolean }>;
    list(): Promise<DraftEntry[]>;
  };
  log: { rendererError(message: string, stack?: string): Promise<{ ok: boolean }> };
  ai: {
    chatStart(req: unknown): Promise<{ ok: boolean; message?: string }>;
    chatCancel(requestId: string): Promise<{ ok: boolean }>;
    secretSet(profileId: string, apiKey: string): Promise<{ ok: boolean; message?: string }>;
    secretStatus(profileId: string): Promise<{ hasKey: boolean }>;
    testConnection(profileId: string): Promise<{ ok: boolean; message: string }>;
    onChunk(cb: (payload: unknown) => void): Unsubscribe;
    onDone(cb: (payload: unknown) => void): Unsubscribe;
    onError(cb: (payload: unknown) => void): Unsubscribe;
  };
  events: {
    onMenuCommand(cb: (payload: unknown) => void): Unsubscribe;
    onOpenPath(cb: (payload: unknown) => void): Unsubscribe;
  };
}

declare global {
  interface Window {
    mdkit?: Bridge;
    /** 测试钩子：浏览器 Mock 的内存文件系统 */
    __mdkitMock?: { files: Map<string, string>; config: UserConfig };
  }
}

function createBrowserMock(): Bridge {
  const files = new Map<string, string>();
  let config = defaultUserConfig();
  const mockState = { files, config };
  if (typeof window !== 'undefined') window.__mdkitMock = mockState;

  const noopUnsub = (): void => undefined;
  return {
    file: {
      openDialog: async () => null,
      pathForFile: (file) => `/mock/${file.name}`,
      openDropped: async (path) => {
        const content = files.get(path) ?? '';
        return { path, name: path.split(/[\\/]/).pop() ?? path, content };
      },
      read: async (path) => {
        const content = files.get(path);
        if (content === undefined) throw new Error('文件不存在');
        return { path, name: path.split(/[\\/]/).pop() ?? path, content };
      },
      save: async (path, content) => {
        files.set(path, content);
        return { ok: true };
      },
      saveAs: async (defaultName, content) => {
        const path = `/mock/${defaultName || '未命名.md'}`;
        files.set(path, content);
        return { path, name: defaultName || '未命名.md' };
      },
      recentList: async () => config.recentFiles,
      recentClear: async () => {
        config = { ...config, recentFiles: [] };
        mockState.config = config;
        return { ok: true };
      },
    },
    config: {
      get: async () => config,
      patch: async (patch) => {
        config = mergeConfig(config, patch);
        mockState.config = config;
        return config;
      },
    },
    theme: { importFile: async () => null, listCustom: async () => [] },
    exporter: { html: async () => null, pdf: async () => null },
    shell: { openExternal: async () => ({ ok: true }) },
    window: { setTitle: async () => ({ ok: true }) },
    drafts: { save: async () => ({ ok: true }), clear: async () => ({ ok: true }), list: async () => [] },
    log: { rendererError: async () => ({ ok: true }) },
    ai: {
      chatStart: async () => ({ ok: false, message: '浏览器模式不支持 AI 请求' }),
      chatCancel: async () => ({ ok: true }),
      secretSet: async () => ({ ok: false, message: '浏览器模式不支持密钥存储' }),
      secretStatus: async () => ({ hasKey: false }),
      testConnection: async () => ({ ok: false, message: '浏览器模式不支持' }),
      onChunk: () => noopUnsub,
      onDone: () => noopUnsub,
      onError: () => noopUnsub,
    },
    events: { onMenuCommand: () => noopUnsub, onOpenPath: () => noopUnsub },
  };
}

let cachedBridge: Bridge | null = null;

/** 获取桥接实例（Electron 优先，浏览器降级 Mock） */
export function bridge(): Bridge {
  if (cachedBridge) return cachedBridge;
  cachedBridge = (typeof window !== 'undefined' && window.mdkit) || createBrowserMock();
  return cachedBridge;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.mdkit);
}
