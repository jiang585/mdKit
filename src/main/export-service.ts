/**
 * 导出服务（主进程侧）：HTML 落盘 + PDF（隐藏窗口 printToPDF）。
 * 输入是渲染管线已确认的文档快照 HTML（E5：新增导出格式只需新增适配器）。
 */
import { app, BrowserWindow, dialog } from 'electron';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log } from './logger';

export async function exportHtml(
  win: BrowserWindow,
  defaultName: string,
  html: string,
): Promise<{ path: string } | null> {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出 HTML',
    defaultPath: defaultName.replace(/\.md$/i, '') + '.html',
    filters: [{ name: 'HTML 文件', extensions: ['html'] }],
  });
  if (canceled || !filePath) return null;
  await writeFile(filePath, html, 'utf-8');
  log.info('已导出 HTML');
  return { path: filePath };
}

export async function exportPdf(
  win: BrowserWindow,
  defaultName: string,
  html: string,
): Promise<{ path: string } | null> {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出 PDF',
    defaultPath: defaultName.replace(/\.md$/i, '') + '.pdf',
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;

  // 大文档经临时文件加载，避免超长 data: URL
  const tmpFile = join(app.getPath('temp'), `mdkit-export-${Date.now()}.html`);
  await writeFile(tmpFile, html, 'utf-8');

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false, // 导出快照无需脚本
    },
  });
  try {
    await printWin.loadURL(pathToFileURL(tmpFile).toString());
    const pdf = await printWin.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 },
      pageSize: 'A4',
    });
    await writeFile(filePath, pdf);
    log.info('已导出 PDF');
    return { path: filePath };
  } finally {
    printWin.destroy();
    await rm(tmpFile, { force: true }).catch(() => undefined);
  }
}
