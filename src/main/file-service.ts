/**
 * 文件管理模块（主进程侧）：打开/读取/保存/另存为/最近文件。
 * 边界：文件路径只能来自系统对话框、最近文件或拖拽授权（决策输入 §4）。
 */
import { BrowserWindow, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { OpenedFile } from '@shared/ipc-contract';
import { log } from './logger';
import { touchRecentFile } from './config-store';

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: '所有文件', extensions: ['*'] },
];

/** 已授权路径集合：系统对话框/拖拽/命令行打开过的路径才允许后续读写 */
const grantedPaths = new Set<string>();
export function grantPath(path: string): void {
  grantedPaths.add(path);
}
function assertGranted(path: string): void {
  if (!grantedPaths.has(path)) {
    throw new Error('路径未经授权');
  }
}

export async function readGrantedFile(path: string): Promise<OpenedFile> {
  assertGranted(path);
  const content = await readFile(path, 'utf-8');
  touchRecentFile(path, basename(path));
  return { path, name: basename(path), content };
}

/** 拖拽/命令行等外部入口打开：授权并读取 */
export async function openExternalPath(path: string): Promise<OpenedFile> {
  grantPath(path);
  return readGrantedFile(path);
}

export async function openViaDialog(win: BrowserWindow): Promise<OpenedFile | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: MD_FILTERS,
  });
  if (canceled || filePaths.length === 0) return null;
  grantPath(filePaths[0]);
  return readGrantedFile(filePaths[0]);
}

export async function saveToPath(path: string, content: string): Promise<void> {
  assertGranted(path);
  await writeFile(path, content, 'utf-8');
  touchRecentFile(path, basename(path));
  log.info(`已保存文档 ${basename(path)}（${content.length} 字符）`);
}

export async function saveAsDialog(
  win: BrowserWindow,
  defaultName: string,
  content: string,
): Promise<{ path: string; name: string } | null> {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '另存为',
    defaultPath: defaultName || '未命名.md',
    filters: MD_FILTERS,
  });
  if (canceled || !filePath) return null;
  grantPath(filePath);
  await writeFile(filePath, content, 'utf-8');
  touchRecentFile(filePath, basename(filePath));
  return { path: filePath, name: basename(filePath) };
}
