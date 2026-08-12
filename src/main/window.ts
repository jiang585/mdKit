/**
 * 主窗口工厂：安全基线（决策输入 §4）
 * contextIsolation:true / nodeIntegration:false / sandbox:true / 严格 CSP / 外链交系统浏览器。
 */
import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'node:path';
import { DOC_ASSET_PROTOCOL, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, SAFE_LINK_PROTOCOLS } from '@shared/constants';
import { log } from './logger';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

function iconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.png');
  }
  return join(__dirname, '../../build/icon.png');
}

function cspValue(): string {
  // KaTeX 需要行内 style 属性；图片允许 https/data/自定义文档协议；连接仅允许自身（AI 走主进程）
  const dev = isDev ? ' ws: http://localhost:*' : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https: http: ${DOC_ASSET_PROTOCOL}:`,
    `connect-src 'self'${dev}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
}

export function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspValue()],
      },
    });
  });
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: '#f7f7f8',
    icon: iconPath(),
    title: 'MD工具箱',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    log.error(`Preload 加载失败：${preloadPath}`, error);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error(`渲染进程异常退出：${details.reason} (${details.exitCode})`);
  });

  // 外部链接交给系统浏览器（协议白名单），窗口内不导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '')) return;
    event.preventDefault();
    openExternalSafe(url);
  });

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

export function openExternalSafe(url: string): void {
  try {
    const protocol = new URL(url).protocol;
    if ((SAFE_LINK_PROTOCOLS as readonly string[]).includes(protocol)) {
      void shell.openExternal(url);
    } else {
      log.warn(`拦截非白名单协议外链：${protocol}`);
    }
  } catch {
    log.warn('拦截非法外链');
  }
}
