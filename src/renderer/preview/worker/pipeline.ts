/**
 * Markdown 渲染管线（决策输入 §7）：
 * remark-parse → remark-gfm → remark-math → remark-rehype
 *   → rehype-sanitize（先消毒；KaTeX/高亮所需结构显式放行）
 *   → 后处理插件（锚点/TOC/图片改写 —— 受信本地产物）
 *   → rehype-katex（失败保留原文并计诊断，不中断整页）
 *   → rehype-highlight（未知语言按纯文本输出）
 *   → rehype-stringify
 * AST 仅在本模块内部存在（§7）。
 */
import { unified, type Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import type { RenderRequest, RenderResult } from '@renderer/shared/render-types';
import { buildSanitizeSchema } from './sanitize-schema';
import { postProcessPlugin, type PostProcessOutput } from './post-process';

const sanitizeSchema = buildSanitizeSchema();

function buildProcessor(docPath: string | null, output: PostProcessOutput): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkRehype, {
      allowDangerousHtml: false,
      footnoteLabel: '脚注',
      footnoteBackLabel: '返回引用处',
      clobberPrefix: 'mk-fn-',
    })
    .use(rehypeSanitize, sanitizeSchema)
    .use(postProcessPlugin, { docPath, output })
    .use(rehypeKatex, { errorColor: 'var(--mk-error-fg)', strict: 'ignore', throwOnError: false })
    .use(rehypeHighlight, { detect: false })
    .use(rehypeStringify) as unknown as Processor;
}

/** 单次渲染（Worker 与导出服务共用；导出走主线程一次性调用） */
export async function renderMarkdown(req: RenderRequest): Promise<RenderResult> {
  const started = performance.now();
  const output: PostProcessOutput = { anchors: [], toc: [] };
  try {
    const processor = buildProcessor(req.docPath, output);
    const file = await processor.process(req.markdown);
    const html = String(file);
    const katexErrors = (html.match(/class="katex-error"/g) ?? []).length;
    return {
      revision: req.revision,
      html,
      anchors: output.anchors,
      toc: output.toc,
      diagnostics:
        katexErrors > 0
          ? [{ kind: 'katex', message: `${katexErrors} 处公式渲染失败，已保留原始 LaTeX` }]
          : [],
      parseMs: performance.now() - started,
    };
  } catch (err) {
    // 管线异常：隔离错误，输出错误占位（开发规范 §6：渲染异常不整页崩溃）
    const message = err instanceof Error ? err.message : '未知渲染错误';
    return {
      revision: req.revision,
      html: `<div class="mk-render-error" role="alert">渲染出错：${escapeHtml(message)}</div>`,
      anchors: [],
      toc: [],
      diagnostics: [{ kind: 'pipeline', message }],
      parseMs: performance.now() - started,
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
