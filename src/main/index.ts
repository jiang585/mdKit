/**
 * 主进程入口：窗口生命周期、单实例、命令行/二次实例打开文件。
 * 主进程不解析 Markdown、不持有编辑器 UI 状态（决策输入 §4）。
 */
import { app, BrowserWindow } from 'electron';
import { dirname } from 'node:path';
import { IPC_PUSH } from '@shared/ipc-contract';
import { createMainWindow, installCsp } from './window';
import { rebuildMenu } from './menu';
import { registerIpc } from './ipc';
import { installAssetProtocol, registerAssetProtocolPrivileges, allowDocDir } from './asset-protocol';
import { openExternalPath } from './file-service';
import { log } from './logger';

let mainWindow: BrowserWindow | null = null;

function mdPathFromArgv(argv: string[]): string | null {
  const candidate = argv.slice(1).find((a) => /\.(md|markdown)$/i.test(a) && !a.startsWith('-'));
  return candidate ?? null;
}

async function pushOpenPath(win: BrowserWindow, path: string): Promise<void> {
  try {
    const file = await openExternalPath(path);
    allowDocDir(dirname(file.path));
    win.webContents.send(IPC_PUSH.openPath, file);
  } catch (err) {
    log.error('通过命令行/二次实例打开文件失败', err);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  registerAssetProtocolPrivileges();

  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const path = mdPathFromArgv(argv);
    if (path) void pushOpenPath(mainWindow, path);
  });

  void app.whenReady().then(() => {
    installCsp();
    installAssetProtocol();
    registerIpc();

    mainWindow = createMainWindow();
    rebuildMenu(mainWindow);

    // 首次启动带文件参数（双击 .md / 拖到 exe 图标）
    const initialPath = mdPathFromArgv(process.argv);
    if (initialPath) {
      mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow) void pushOpenPath(mainWindow, initialPath);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
        rebuildMenu(mainWindow);
      }
    });

    log.info('应用启动完成');
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
