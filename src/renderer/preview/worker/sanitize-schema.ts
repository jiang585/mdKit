/**
 * 预览消毒白名单（决策输入 §7）：
 * - 原始 HTML 经 rehype-raw 解析后在此消毒：保留排版类标签与 style/color 等展示属性，
 *   丢弃脚本 / 内联事件 / 表单等（style 值另由 post-process 做属性白名单过滤）；
 * - URL 协议白名单，禁止 javascript: 等危险协议；
 * - 显式放行 KaTeX（math 类）与代码高亮所需结构；任务列表复选框保留（预览态只读）。
 */
import { defaultSchema } from 'rehype-sanitize';
import { DOC_ASSET_PROTOCOL } from '@shared/constants';

type Schema = typeof defaultSchema;

function extendAttrs(base: Schema['attributes'], tag: string, extra: unknown[]): unknown[] {
  return [...((base?.[tag] as unknown[] | undefined) ?? []), ...extra];
}

/** 默认（GitHub）白名单之外放行的内嵌 HTML 排版标签 */
const EXTRA_HTML_TAGS = [
  'input', 'section', 'font', 'u', 'mark', 'center', 'small', 'big', 'abbr', 'cite',
  'caption', 'colgroup', 'col', 'figure', 'figcaption',
];

export function buildSanitizeSchema(): Schema {
  const attributes = {
    ...defaultSchema.attributes,
    // 内嵌 HTML 展示属性：style（post-process 二次过滤）、表格底色、<font face>
    '*': extendAttrs(defaultSchema.attributes, '*', ['style', 'bgColor', 'face']),
    // KaTeX 数学节点（sanitize 先行，rehype-katex 之后在受信环境展开）
    div: extendAttrs(defaultSchema.attributes, 'div', [['className', 'math', 'math-display']]),
    span: extendAttrs(defaultSchema.attributes, 'span', [['className', 'math', 'math-inline']]),
    code: extendAttrs(defaultSchema.attributes, 'code', [
      ['className', /^language-[\w+-]+$/, 'math-inline', 'math-display'],
    ]),
    // GFM 任务列表复选框（F3.7）
    input: [
      ['type', 'checkbox'],
      ['checked'],
      ['disabled'],
    ],
    // 表格对齐
    th: extendAttrs(defaultSchema.attributes, 'th', [['align']]),
    td: extendAttrs(defaultSchema.attributes, 'td', [['align']]),
  } as Schema['attributes'];

  return {
    ...defaultSchema,
    attributes,
    tagNames: [...(defaultSchema.tagNames ?? []), ...EXTRA_HTML_TAGS],
    // <style> 内容整体丢弃，避免 CSS 源码以文本形式漏进预览
    strip: [...(defaultSchema.strip ?? []), 'style'],
    protocols: {
      ...defaultSchema.protocols,
      href: ['http', 'https', 'mailto'],
      // file: 由 post-process 改写为受控本地协议
      src: ['http', 'https', 'data', 'file', DOC_ASSET_PROTOCOL],
    },
  };
}
