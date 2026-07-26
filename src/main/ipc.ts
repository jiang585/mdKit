/**
 * IPC 注册：所有入站载荷经 Zod 校验（非法载荷统一拒绝并记录），
 * 响应为可序列化纯数据。渲染进程仅能调用 preload 白名单内通道。
 */
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { dirname } from 'node:path';
import type { z } from 'zod';
import {
  aiCancelReqSchema,
  aiChatStartReqSchema,
  aiProfileIdReqSchema,
  aiSecretSetReqSchema,
  draftClearReqSchema,
  draftSaveReqSchema,
  exportHtmlReqSchema,
  exportPdfReqSchema,
  IPC,
  openDroppedReqSchema,
  openExternalReqSchema,
  readFileReqSchema,
  rendererErrorReqSchema,
  saveAsReqSchema,
  saveFileReqSchema,
  setTitleReqSchema,
} from '@shared/ipc-contract';
import { userConfigPatchSchema } from '@shared/config-schema';
import { APP_NAME } from '@shared/constants';
import { clearRecentFiles, getConfig, patchConfig } from './config-store';
import {
  openExternalPath,
  openViaDialog,
  readGrantedFile,
  saveAsDialog,
  saveToPath,
  grantPath,
} from './file-service';
import { clearDraft, listDrafts, saveDraft } from './drafts';
import { importThemeViaDialog, listCustomThemes } from './theme-files';
import { exportHtml, exportPdf } from './export-service';
import { cancelChat, secretStatus, setSecret, startChat, testConnection } from './ai-service';
import { allowDocDir } from './asset-protocol';
import { openExternalSafe } from './window';
import { rebuildMenu } from './menu';
import { log } from './logger';

function windowOf(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('窗口已销毁');
  return win;
}

/** 带校验的 handle 注册器 */
function handle<S extends z.ZodTypeAny>(
  channel: string,
  schema: S | null,
  handler: (event: IpcMainInvokeEvent, payload: z.infer<S>) => unknown,
): void {
  ipcMain.handle(channel, async (event, rawPayload: unknown) => {
    let payload: unknown = undefined;
    if (schema) {
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) {
        log.warn(`IPC 非法载荷 ${channel}: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
        throw new Error(`非法请求载荷（${channel}）`);
      }
      payload = parsed.data;
    }
    return handler(event, payload as z.infer<S>);
  });
}

export function registerIpc(): void {
  /* ---------- 文件 ---------- */
  handle(IPC.fileOpenDialog, null, async (event) => {
    const file = await openViaDialog(windowOf(event));
    if (file) allowDocDir(dirname(file.path));
    return file;
  });

  handle(IPC.fileRead, readFileReqSchema, async (_event, { path }) => {
    const file = await readGrantedFile(path);
    allowDocDir(dirname(file.path));
    return file;
  });

  // 拖拽打开（F1.7）：视为用户授权来源，仅放行 .md/.markdown
  handle(IPC.fileOpenDropped, openDroppedReqSchema, async (_event, { path }) => {
    const file = await openExternalPath(path);
    allowDocDir(dirname(file.path));
    return file;
  });

  handle(IPC.fileSave, saveFileReqSchema, async (_event, { path, content }) => {
    await saveToPath(path, content);
    return { ok: true };
  });

  handle(IPC.fileSaveAs, saveAsReqSchema, async (event, { defaultName, content }) => {
    const saved = await saveAsDialog(windowOf(event), defaultName, content);
    if (saved) allowDocDir(dirname(saved.path));
    return saved;
  });

  handle(IPC.fileRecentList, null, () => {
    // 最近文件属已授权来源，允许后续直接读取
    const items = getConfig().recentFiles;
    items.forEach((f) => grantPath(f.path));
    return items;
  });

  handle(IPC.fileRecentClear, null, () => {
    clearRecentFiles();
    return { ok: true };
  });

  /* ---------- 配置 ---------- */
  handle(IPC.configGet, null, () => getConfig());

  handle(IPC.configPatch, userConfigPatchSchema, (event, patch) => {
    const next = patchConfig(patch);
    // 主题/快捷键变化会影响菜单（radio 勾选与加速键）
    if (patch.theme || patch.shortcuts) rebuildMenu(windowOf(event));
    return next;
  });

  /* ---------- 主题文件 ---------- */
  handle(IPC.themeImport, null, (event) => importThemeViaDialog(windowOf(event)));
  handle(IPC.themeListCustom, null, () => listCustomThemes());

  /* ---------- 导出 ---------- */
  handle(IPC.exportHtml, exportHtmlReqSchema, (event, { defaultName, html }) =>
    exportHtml(windowOf(event), defaultName, html),
  );
  handle(IPC.exportPdf, exportPdfReqSchema, (event, { defaultName, html }) =>
    exportPdf(windowOf(event), defaultName, html),
  );

  /* ---------- 系统 ---------- */
  handle(IPC.shellOpenExternal, openExternalReqSchema, (_event, { url }) => {
    openExternalSafe(url);
    return { ok: true };
  });

  handle(IPC.windowSetTitle, setTitleReqSchema, (event, { title, dirty }) => {
    windowOf(event).setTitle(`${dirty ? '● ' : ''}${title} — ${APP_NAME}`);
    return { ok: true };
  });

  /* ---------- 草稿（崩溃恢复） ---------- */
  handle(IPC.draftSave, draftSaveReqSchema, (_event, { tabId, path, content }) => {
    saveDraft(tabId, path, content);
    return { ok: true };
  });
  handle(IPC.draftClear, draftClearReqSchema, (_event, { tabId }) => {
    clearDraft(tabId);
    return { ok: true };
  });
  handle(IPC.draftList, null, () => listDrafts());

  /* ---------- 日志 ---------- */
  handle(IPC.logRendererError, rendererErrorReqSchema, (_event, { message }) => {
    log.error(`渲染进程错误：${message}`);
    return { ok: true };
  });

  /* ---------- AI ---------- */
  handle(IPC.aiChatStart, aiChatStartReqSchema, (event, req) => startChat(event.sender, req));
  handle(IPC.aiChatCancel, aiCancelReqSchema, (_event, { requestId }) => {
    cancelChat(requestId);
    return { ok: true };
  });
  handle(IPC.aiSecretSet, aiSecretSetReqSchema, (_event, { profileId, apiKey }) =>
    setSecret(profileId, apiKey),
  );
  handle(IPC.aiSecretStatus, aiProfileIdReqSchema, (_event, { profileId }) => secretStatus(profileId));
  handle(IPC.aiTestConnection, aiProfileIdReqSchema, (_event, { profileId }) => testConnection(profileId));
}
