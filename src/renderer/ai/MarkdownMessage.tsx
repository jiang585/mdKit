/**
 * AI 消息 Markdown 渲染组件（本版新增增强）：
 * - GFM + KaTeX + 代码高亮，与预览区同一套消毒白名单与主题变量；
 * - 流式期间 80ms 防抖增量重渲染，完成后最终渲染一次。
 */
import { memo, useEffect, useState } from 'react';
import { renderAiMarkdown } from './markdown-render';

interface MarkdownMessageProps {
  content: string;
  streaming: boolean;
}

export const MarkdownMessage = memo(function MarkdownMessage({ content, streaming }: MarkdownMessageProps) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      void renderAiMarkdown(content).then((out) => {
        if (alive) setHtml(out);
      });
    }, streaming ? 80 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [content, streaming]);

  return <div className="mk-ai-md mk-preview-content" dangerouslySetInnerHTML={{ __html: html }} />;
});
