/**
 * 预览消毒白名单（决策输入 §7）：
 * - 不执行 Markdown 中的原始 HTML / 脚本 / 内联事件（remark-rehype 已丢弃原始 HTML，此处双保险）；
 * - URL 协议白名单，禁止 javascript: 等危险协议；
 * - 显式放行 KaTeX（math 类）与代码高亮所需结构；任务列表复选框保留（预览态只读）。
 */
import { defaultSchema } from 'rehype-sanitize';
import { DOC_ASSET_PROTOCOL } from '@shared/constants';

type Schema = typeof defaultSchema;

function extendAttrs(base: Schema['attributes'], tag: string, extra: unknown[]): unknown[] {
  return [...((base?.[tag] as unknown[] | undefined) ?? []), ...extra];
}

export function buildSanitizeSchema(): Schema {
  const attributes = {
    ...defaultSchema.attributes,
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
    tagNames: [...(defaultSchema.tagNames ?? []), 'input', 'section'],
    protocols: {
      ...defaultSchema.protocols,
      href: ['http', 'https', 'mailto'],
      src: ['http', 'https', 'data', DOC_ASSET_PROTOCOL],
    },
  };
}
