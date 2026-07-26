/** Electron 最小声明（覆盖本项目使用面；沙盒类型检查用） */
declare module 'electron' {
  export interface WebContents {
    send(channel: string, payload?: unknown): void;
    isDestroyed(): boolean;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
    once(event: string, listener: (...args: any[]) => void): void;
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void;
    printToPDF(options: {
      printBackground?: boolean;
      margins?: { top?: number; bottom?: number; left?: number; right?: number };
      pageSize?: string;
    }): Promise<Buffer>;
  }

  export interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    show?: boolean;
    title?: string;
    backgroundColor?: string;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      sandbox?: boolean;
      spellcheck?: boolean;
      javascript?: boolean;
    };
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    static getAllWindows(): BrowserWindow[];
    static fromWebContents(contents: WebContents): BrowserWindow | null;
    webContents: WebContents;
    loadURL(url: string): Promise<void>;
    loadFile(path: string): Promise<void>;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    once(event: string, listener: (...args: any[]) => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
    show(): void;
    focus(): void;
    restore(): void;
    isMinimized(): boolean;
    setTitle(title: string): void;
    destroy(): void;
  }

  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: never[]) => void): void;
    quit(): void;
    requestSingleInstanceLock(): boolean;
    getPath(name: string): string;
    getVersion(): string;
    isPackaged: boolean;
  };

  export interface IpcMainInvokeEvent {
    sender: WebContents;
  }

  export const ipcMain: {
    handle(channel: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => unknown): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
    on(channel: string, listener: (event: unknown, payload: unknown) => void): void;
    removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): void;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };

  export const webUtils: {
    getPathForFile(file: File): string;
  };

  export const dialog: {
    showOpenDialog(
      win: BrowserWindow,
      options: {
        title?: string;
        properties?: string[];
        filters?: Array<{ name: string; extensions: string[] }>;
      },
    ): Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog(
      win: BrowserWindow,
      options: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      },
    ): Promise<{ canceled: boolean; filePath?: string }>;
  };

  export interface MenuItemConstructorOptions {
    label?: string;
    role?: string;
    type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
    checked?: boolean;
    enabled?: boolean;
    accelerator?: string;
    click?: () => void;
    submenu?: MenuItemConstructorOptions[];
  }

  export const Menu: {
    buildFromTemplate(template: MenuItemConstructorOptions[]): unknown;
    setApplicationMenu(menu: unknown): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };

  export const session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived(
          listener: (
            details: { responseHeaders?: Record<string, string[]> },
            callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
          ) => void,
        ): void;
      };
    };
  };

  export const protocol: {
    registerSchemesAsPrivileged(
      schemes: Array<{
        scheme: string;
        privileges?: { secure?: boolean; supportFetchAPI?: boolean; stream?: boolean };
      }>,
    ): void;
    handle(scheme: string, handler: (request: { url: string }) => Response | Promise<Response>): void;
  };

  export const net: {
    fetch(url: string): Promise<Response>;
  };

  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(text: string): Buffer;
    decryptString(data: Buffer): string;
  };

  export class Response {
    constructor(body?: string, init?: { status?: number });
  }
}
