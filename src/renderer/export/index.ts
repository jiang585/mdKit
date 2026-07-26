/**
 * 导出服务模块入口（≤5 个核心接口）。
 * 职责：接收「已确认的文档快照」，输出为指定格式文件（E5：新增格式=新增适配器）。
 * 不知道：编辑器实例、布局组件；渲染复用渲染管线模块公开接口。
 *
 * 公开接口：
 *   1. exportAsHtml —— 导出独立 HTML
 *   2. exportAsPdf  —— 导出 PDF（主进程 printToPDF）
 */
import { renderMarkdownOnce } from '@renderer/preview/index';
import { bridge } from '@renderer/shared/bridge';
import { buildStandaloneHtml } from './html-template';

export interface ExportInput {
  markdown: string;
  docPath: string | null;
  fileName: string;
  /** 当前预览主题变量快照（导出所见即所得） */
  themeVars: Record<string, string>;
}

async function renderBody(input: ExportInput): Promise<string> {
  const result = await renderMarkdownOnce({
    revision: 0,
    markdown: input.markdown,
    docPath: input.docPath,
  });
  return result.html;
}

export async function exportAsHtml(input: ExportInput): Promise<{ path: string } | null> {
  const bodyHtml = await renderBody(input);
  const html = buildStandaloneHtml({
    title: input.fileName.replace(/\.(md|markdown)$/i, ''),
    bodyHtml,
    themeVars: input.themeVars,
  });
  return bridge().exporter.html(input.fileName, html);
}

export async function exportAsPdf(input: ExportInput): Promise<{ path: string } | null> {
  const bodyHtml = await renderBody(input);
  const html = buildStandaloneHtml({
    title: input.fileName.replace(/\.(md|markdown)$/i, ''),
    bodyHtml,
    themeVars: input.themeVars,
    forPrint: true,
  });
  return bridge().exporter.pdf(input.fileName, html);
}
