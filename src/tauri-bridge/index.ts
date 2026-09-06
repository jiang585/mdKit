/**
 * Tauri 桥接实现：以 Bridge 接口的语义把渲染进程接入 Rust 壳（替代 Electron preload）。
 * - 通道名与原 IPC 契约一一对应（invoke 走 snake_case 命令，推送沿用 IPC_PUSH 字符串）；
 * - 在 Tauri 运行时自注入 window.mdkit，renderer 其余代码零感知；
 * - 浏览器/测试环境不安装，bridge.ts 自动降级内存 Mock。
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UserConfig, UserConfigPatch } from '@shared/config-schema';
import type { Bridge } from '@renderer/shared/bridge';

type Unsubscribe = () => void;

/** Tauri 运行时注入的内部对象（devtools 与打包产物均在页面脚本前就绪） */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/* ---------- IPC 契约通道 → Tauri 命令名 ---------- */

const CMD = {
  fileOpenDialog: 'file_open_dialog',
  fileOpenDropped: 'file_open_dropped',
  fileRead: 'file_read',
  fileSave: 'file_save',
  fileSaveAs: 'file_save_as',
  fileRecentList: 'file_recent_list',
  fileRecentClear: 'file_recent_clear',
  configGet: 'config_get',
  configPatch: 'config_patch',
  themeImport: 'theme_import',
  themeListCustom: 'theme_list_custom',
  exportHtml: 'export_html',
  exportPdf: 'export_pdf',
  shellOpenExternal: 'shell_open_external',
  windowSetTitle: 'window_set_title',
  draftSave: 'draft_save',
  draftClear: 'draft_clear',
  draftList: 'draft_list',
  logRendererError: 'log_renderer_error',
  aiChatStart: 'ai_chat_start',
  aiChatCancel: 'ai_chat_cancel',
  aiSecretSet: 'ai_secret_set',
  aiSecretStatus: 'ai_secret_status',
  aiTestConnection: 'ai_test_connection',
} as const;

/** 推送通道与 src/shared/ipc-contract.ts 的 IPC_PUSH 完全一致（两端各持一份，注释锁定命名） */
const PUSH = {
  menuCommand: 'menu:command',
  openPath: 'app:open-path',
  aiChunk: 'ai:chat-chunk',
  aiDone: 'ai:chat-done',
  aiError: 'ai:chat-error',
} as const;

/* ---------- 推送订阅：把异步 listen 包成同步取消语义 ---------- */

function onPush<T>(event: string): (cb: (payload: T) => void) => Unsubscribe {
  return (cb) => {
    let disposed = false;
    let unlisten: UnlistenFn | null = null;
    void listen<T>(event, (e) => cb(e.payload))
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  };
}

/* ---------- 拖拽路径（Tauri 原生拖拽事件，替代 webUtils.getPathForFile） ---------- */

type DragDropPayload =
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' };

function onDropPaths(cb: (paths: string[]) => void): Unsubscribe {
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  const promise = getCurrentWebviewWindow().onDragDropEvent((event) => {
    const payload = event.payload as DragDropPayload;
    if (payload.type === 'drop' && payload.paths.length > 0) cb(payload.paths);
  });
  void promise.then((u) => {
    if (disposed) u();
    else unlisten = u;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/* ---------- Bridge 组装 ---------- */

function createTauriBridge(): Bridge {
  return {
    file: {
      openDialog: () => invoke(CMD.fileOpenDialog),
      pathForFile: (file: File): string => {
        // Tauri 的拖拽路径经原生事件提供（onDropPaths），HTML5 drop 事件在 Tauri 下不触发；
        // 保留抛错语义以驱动 App.tsx 的浏览器回退分支。
        throw new Error(`Tauri 环境不支持从 File 取路径（${file.name}）`);
      },
      openDropped: (path: string) => invoke(CMD.fileOpenDropped, { payload: { path } }),
      read: (path: string) => invoke(CMD.fileRead, { payload: { path } }),
      save: (path: string, content: string) => invoke(CMD.fileSave, { payload: { path, content } }),
      saveAs: (defaultName: string, content: string) =>
        invoke(CMD.fileSaveAs, { payload: { defaultName, content } }),
      recentList: () => invoke(CMD.fileRecentList),
      recentClear: () => invoke(CMD.fileRecentClear),
      onDropPaths,
    },
    config: {
      get: () => invoke<UserConfig>(CMD.configGet),
      patch: (patch: UserConfigPatch) => invoke(CMD.configPatch, { payload: patch }),
    },
    theme: {
      importFile: () => invoke(CMD.themeImport),
      listCustom: () => invoke(CMD.themeListCustom),
    },
    exporter: {
      html: (defaultName: string, html: string) =>
        invoke(CMD.exportHtml, { payload: { defaultName, html } }),
      pdf: (defaultName: string, html: string) =>
        invoke(CMD.exportPdf, { payload: { defaultName, html } }),
    },
    shell: {
      openExternal: (url: string) => invoke(CMD.shellOpenExternal, { payload: { url } }),
    },
    window: {
      setTitle: (title: string, documentPath: string | null, dirty: boolean) =>
        invoke(CMD.windowSetTitle, { payload: { title, documentPath, dirty } }),
    },
    drafts: {
      save: (tabId: string, path: string | null, content: string) =>
        invoke(CMD.draftSave, { payload: { tabId, path, content } }),
      clear: (tabId: string) => invoke(CMD.draftClear, { payload: { tabId } }),
      list: () => invoke(CMD.draftList),
    },
    log: {
      rendererError: (message: string, stack?: string) =>
        invoke(CMD.logRendererError, { payload: { message, stack } }),
    },
    ai: {
      chatStart: (req: unknown) => invoke(CMD.aiChatStart, { payload: req }),
      chatCancel: (requestId: string) => invoke(CMD.aiChatCancel, { payload: { requestId } }),
      secretSet: (profileId: string, apiKey: string) =>
        invoke(CMD.aiSecretSet, { payload: { profileId, apiKey } }),
      secretStatus: (profileId: string) => invoke(CMD.aiSecretStatus, { payload: { profileId } }),
      testConnection: (profileId: string) => invoke(CMD.aiTestConnection, { payload: { profileId } }),
      onChunk: onPush(PUSH.aiChunk),
      onDone: onPush(PUSH.aiDone),
      onError: onPush(PUSH.aiError),
    },
    events: {
      onMenuCommand: onPush(PUSH.menuCommand),
      onOpenPath: onPush(PUSH.openPath),
    },
  } as Bridge;
}

/** 在 Tauri 运行时安装桥。模块副作用自安装（main.tsx 首个 import，先于任何 bridge() 消费者求值） */
export function installTauriBridge(): void {
  if (!isTauriRuntime()) return;
  if (!window.mdkit) window.mdkit = createTauriBridge();
}

installTauriBridge();
