/**
 * 独立 HTML 模板（F6.1 / E5）：渲染结果 + 主题变量 + 预览排版样式内联，
 * 零外部资源引用（离线可打开；KaTeX 字体缺失时由 MathML 兜底显示）。
 */
import previewCss from '@renderer/styles/preview.css?raw';
import katexCss from 'katex/dist/katex.min.css?raw';

export interface StandaloneHtmlInput {
  title: string;
  bodyHtml: string;
  /** 预览命名空间 CSS 变量（导出时快照当前主题） */
  themeVars: Record<string, string>;
  /** PDF 导出时使用打印友好背景 */
  forPrint?: boolean;
}

export function buildStandaloneHtml(input: StandaloneHtmlInput): string {
  const varLines = Object.entries(input.themeVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const printCss = input.forPrint
    ? `@page { margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
    : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(input.title)}</title>
<style>
:root {
${varLines}
  --mk-font-mono: "Cascadia Code", Consolas, "JetBrains Mono", monospace;
}
${katexCss}
${previewCss}
body {
  margin: 0;
  background: var(--mk-preview-bg);
}
.mk-preview-content {
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 40px 96px;
}
${printCss}
</style>
</head>
<body>
<main class="mk-preview-content markdown-body">
${input.bodyHtml}
</main>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
