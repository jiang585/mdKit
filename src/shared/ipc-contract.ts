/**
 * IPC 契约：通道名 + Zod 载荷模式 + 派生 TS 类型。
 * 主进程对每个入站请求做运行时校验（架构决策输入 §4：IPC 请求和响应均校验载荷）。
 * preload 只暴露这里列出的通道，渲染进程无法发起任意 IPC。
 */
import { z } from 'zod';

/* ---------- 基础形状 ---------- */

export const filePathSchema = z.string().min(1).max(4096);

export const openedFileSchema = z.object({
  path: filePathSchema,
  name: z.string(),
  content: z.string(),
});
export type OpenedFile = z.infer<typeof openedFileSchema>;

export const recentFileSchema = z.object({
  path: filePathSchema,
  name: z.string(),
  lastOpenedAt: z.number(),
});
export type RecentFile = z.infer<typeof recentFileSchema>;

/* ---------- 请求载荷 ---------- */

export const readFileReqSchema = z.object({ path: filePathSchema });
/** 拖拽进窗口的文件：仅放行 Markdown 扩展名 */
export const openDroppedReqSchema = z.object({
  path: filePathSchema.regex(/\.(md|markdown)$/i, '仅支持 Markdown 文件'),
});
export const saveFileReqSchema = z.object({ path: filePathSchema, content: z.string() });
export const saveAsReqSchema = z.object({ defaultName: z.string().max(255), content: z.string() });

export const setTitleReqSchema = z.object({
  title: z.string().max(512),
  documentPath: filePathSchema.nullable(),
  dirty: z.boolean(),
});

export const openExternalReqSchema = z.object({ url: z.string().url().max(2048) });

export const exportHtmlReqSchema = z.object({ defaultName: z.string().max(255), html: z.string() });
export const exportPdfReqSchema = z.object({ defaultName: z.string().max(255), html: z.string() });

export const draftSaveReqSchema = z.object({
  tabId: z.string().min(1).max(64),
  path: filePathSchema.nullable(),
  content: z.string(),
});
export const draftClearReqSchema = z.object({ tabId: z.string().min(1).max(64) });
export const draftEntrySchema = z.object({
  tabId: z.string(),
  path: filePathSchema.nullable(),
  content: z.string(),
  savedAt: z.number(),
});
export type DraftEntry = z.infer<typeof draftEntrySchema>;

export const rendererErrorReqSchema = z.object({
  message: z.string().max(4000),
  stack: z.string().max(20000).optional(),
});

/* ---------- AI ---------- */

export const aiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});
export type AiMessage = z.infer<typeof aiMessageSchema>;

export const aiChatStartReqSchema = z.object({
  requestId: z.string().min(1).max(64),
  profileId: z.string().min(1).max(64),
  messages: z.array(aiMessageSchema).min(1).max(64),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(32768).optional(),
});
export type AiChatStartReq = z.infer<typeof aiChatStartReqSchema>;

export const aiCancelReqSchema = z.object({ requestId: z.string().min(1).max(64) });
export const aiSecretSetReqSchema = z.object({
  profileId: z.string().min(1).max(64),
  apiKey: z.string().max(512),
});
export const aiProfileIdReqSchema = z.object({ profileId: z.string().min(1).max(64) });

export const aiChunkEventSchema = z.object({ requestId: z.string(), delta: z.string() });
export const aiDoneEventSchema = z.object({
  requestId: z.string(),
  finishReason: z.string().nullable(),
});
export const aiErrorEventSchema = z.object({ requestId: z.string(), message: z.string() });

/* ---------- 通道名 ---------- */

/** invoke（请求/响应）通道 */
export const IPC = {
  fileOpenDialog: 'file:open-dialog',
  fileOpenDropped: 'file:open-dropped',
  fileRead: 'file:read',
  fileSave: 'file:save',
  fileSaveAs: 'file:save-as',
  fileRecentList: 'file:recent-list',
  fileRecentClear: 'file:recent-clear',
  configGet: 'config:get',
  configPatch: 'config:patch',
  themeImport: 'theme:import',
  themeListCustom: 'theme:list-custom',
  exportHtml: 'export:html',
  exportPdf: 'export:pdf',
  shellOpenExternal: 'shell:open-external',
  windowSetTitle: 'window:set-title',
  draftSave: 'draft:save',
  draftClear: 'draft:clear',
  draftList: 'draft:list',
  logRendererError: 'log:renderer-error',
  aiChatStart: 'ai:chat-start',
  aiChatCancel: 'ai:chat-cancel',
  aiSecretSet: 'ai:secret-set',
  aiSecretStatus: 'ai:secret-status',
  aiTestConnection: 'ai:test-connection',
} as const;

/** 主进程 → 渲染进程推送通道 */
export const IPC_PUSH = {
  menuCommand: 'menu:command',
  openPath: 'app:open-path',
  aiChunk: 'ai:chat-chunk',
  aiDone: 'ai:chat-done',
  aiError: 'ai:chat-error',
} as const;

/** 菜单命令 ID（原生菜单 → 渲染进程路由） */
export const MENU_COMMANDS = [
  'file.new',
  'file.open',
  'file.save',
  'file.saveAs',
  'file.closeTab',
  'file.exportHtml',
  'file.exportPdf',
  'view.modeSplit',
  'view.modeEditor',
  'view.modePreview',
  'view.toggleToc',
  'view.toggleAiPanel',
  'view.openSettings',
  'theme.next',
  'theme.pick.light-default',
  'theme.pick.light-sepia',
  'theme.pick.dark-default',
  'theme.pick.dark-ocean',
  'help.about',
] as const;
export type MenuCommand = (typeof MENU_COMMANDS)[number];
export const menuCommandSchema = z.enum(MENU_COMMANDS);
