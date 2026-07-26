/**
 * 自定义主题文件管理（F4.6）：导入 JSON 主题到 userData/themes/。
 * 具体 JSON Schema 校验由渲染进程主题引擎（Ajv）完成；此处仅做基本形状与大小防护。
 */
import { app, BrowserWindow, dialog } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './logger';

const MAX_THEME_BYTES = 64 * 1024;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

function themesDir(): string {
  const dir = join(app.getPath('userData'), 'themes');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export async function importThemeViaDialog(
  win: BrowserWindow,
): Promise<{ json: string } | { error: string } | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '导入主题（JSON）',
    properties: ['openFile'],
    filters: [{ name: '主题文件', extensions: ['json'] }],
  });
  if (canceled || filePaths.length === 0) return null;
  try {
    const raw = readFileSync(filePaths[0], 'utf-8');
    if (raw.length > MAX_THEME_BYTES) return { error: '主题文件过大（>64KB）' };
    const parsed = JSON.parse(raw) as { id?: unknown };
    if (typeof parsed.id !== 'string' || !SAFE_ID.test(parsed.id)) {
      return { error: '主题 id 非法：需为小写字母/数字/连字符' };
    }
    writeFileSync(join(themesDir(), `${parsed.id}.json`), raw, 'utf-8');
    return { json: raw };
  } catch (err) {
    log.error('导入主题失败', err);
    return { error: '主题文件解析失败：' + (err instanceof Error ? err.message : '未知错误') };
  }
}

export function listCustomThemes(): string[] {
  try {
    return readdirSync(themesDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => readFileSync(join(themesDir(), f), 'utf-8'))
      .filter((raw) => raw.length <= MAX_THEME_BYTES);
  } catch {
    return [];
  }
}
