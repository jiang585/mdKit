/**
 * AI 消息 Markdown 渲染（本版新增增强）：复用预览渲染管线的处理器配方。
 * AI 输出视为不可信内容：走 rehype-sanitize（与预览区同一白名单）消毒后再产出 HTML。
 * 与预览管线的差异：不跑 post-process（聊天无需锚点/TOC/本地图片改写）。
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
import { buildSanitizeSchema } from '@renderer/preview/index';

let processor: Processor | null = null;
const htmlCache = new Map<string, string>();
const CACHE_MAX = 200;

function getProcessor(): Processor {
  if (!processor) {
    processor = unified()
      .use(remarkParse)
      .use(remarkGfm, { singleTilde: false })
      .use(remarkMath)
      .use(remarkRehype, { allowDangerousHtml: false, clobberPrefix: 'mk-ai-fn-' })
      .use(rehypeSanitize, buildSanitizeSchema())
      .use(rehypeKatex, { errorColor: 'var(--mk-error-fg)', strict: 'ignore' })
      .use(rehypeHighlight, { detect: false })
      .use(rehypeStringify) as unknown as Processor;
  }
  return processor;
}

/** Markdown → 消毒后的 HTML（小消息缓存，流式增量时避免重复渲染历史消息） */
export async function renderAiMarkdown(content: string): Promise<string> {
  const cached = htmlCache.get(content);
  if (cached !== undefined) return cached;
  const file = await getProcessor().process(content);
  const html = String(file);
  if (htmlCache.size >= CACHE_MAX) htmlCache.clear();
  htmlCache.set(content, html);
  return html;
}
