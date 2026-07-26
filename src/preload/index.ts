/**
 * Preload：以 contextBridge 暴露有限、类型化的 IPC 方法（决策输入 §4）。
 * 不暴露 ipcRenderer 本体、不暴露 fs/路径/任意通道调用能力。
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, IPC_PUSH } from '@shared/ipc-contract';

type Unsubscribe = () => void;

function on(channel: string): (cb: (payload: unknown) => void) => Unsubscribe {
  return (cb) => {
    const listener = (_event: unknown, payload: unknown): void => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

/** window.mdkit —— 渲染进程可用的全部主进程能力 */
const api = {
  file: {
    openDialog: () => ipcRenderer.invoke(IPC.fileOpenDialog),
    /** 拖拽文件 → 绝对路径（sandbox 下 File.path 不可用，经 webUtils 取得） */
    pathForFile: (file: File) => webUtils.getPathForFile(file),
    openDropped: (path: string) => ipcRenderer.invoke(IPC.fileOpenDropped, { path }),
    read: (path: string) => ipcRenderer.invoke(IPC.fileRead, { path }),
    save: (path: string, content: string) => ipcRenderer.invoke(IPC.fileSave, { path, content }),
    saveAs: (defaultName: string, content: string) =>
      ipcRenderer.invoke(IPC.fileSaveAs, { defaultName, content }),
    recentList: () => ipcRenderer.invoke(IPC.fileRecentList),
    recentClear: () => ipcRenderer.invoke(IPC.fileRecentClear),
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.configGet),
    patch: (patch: unknown) => ipcRenderer.invoke(IPC.configPatch, patch),
  },
  theme: {
    importFile: () => ipcRenderer.invoke(IPC.themeImport),
    listCustom: () => ipcRenderer.invoke(IPC.themeListCustom),
  },
  exporter: {
    html: (defaultName: string, html: string) => ipcRenderer.invoke(IPC.exportHtml, { defaultName, html }),
    pdf: (defaultName: string, html: string) => ipcRenderer.invoke(IPC.exportPdf, { defaultName, html }),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, { url }),
  },
  window: {
    setTitle: (title: string, documentPath: string | null, dirty: boolean) =>
      ipcRenderer.invoke(IPC.windowSetTitle, { title, documentPath, dirty }),
  },
  drafts: {
    save: (tabId: string, path: string | null, content: string) =>
      ipcRenderer.invoke(IPC.draftSave, { tabId, path, content }),
    clear: (tabId: string) => ipcRenderer.invoke(IPC.draftClear, { tabId }),
    list: () => ipcRenderer.invoke(IPC.draftList),
  },
  log: {
    rendererError: (message: string, stack?: string) =>
      ipcRenderer.invoke(IPC.logRendererError, { message, stack }),
  },
  ai: {
    chatStart: (req: unknown) => ipcRenderer.invoke(IPC.aiChatStart, req),
    chatCancel: (requestId: string) => ipcRenderer.invoke(IPC.aiChatCancel, { requestId }),
    secretSet: (profileId: string, apiKey: string) =>
      ipcRenderer.invoke(IPC.aiSecretSet, { profileId, apiKey }),
    secretStatus: (profileId: string) => ipcRenderer.invoke(IPC.aiSecretStatus, { profileId }),
    testConnection: (profileId: string) => ipcRenderer.invoke(IPC.aiTestConnection, { profileId }),
    onChunk: on(IPC_PUSH.aiChunk),
    onDone: on(IPC_PUSH.aiDone),
    onError: on(IPC_PUSH.aiError),
  },
  events: {
    onMenuCommand: on(IPC_PUSH.menuCommand),
    onOpenPath: on(IPC_PUSH.openPath),
  },
} as const;

contextBridge.exposeInMainWorld('mdkit', api);

export type MdkitBridge = typeof api;
