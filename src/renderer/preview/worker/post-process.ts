/**
 * 渲染后处理插件（rehype，消毒之后运行）：
 * 1. 为块级元素写入 data-md-line / data-md-line-end（滚动锚点与光标同步元数据）；
 * 2. 标题写入稳定 id 并收集 TOC；
 * 3. 相对路径图片改写为 mdkit-doc:// 协议（本地图片内联预览）；
 * 4. 任务列表复选框强制只读。
 * 零依赖 hast 遍历（不引入 AST 到模块外 —— §7）。
 */
import type { BlockAnchor, TocItem } from '@renderer/shared/render-types';
import { DOC_ASSET_PROTOCOL } from '@shared/constants';

/* ---- 最小 hast 形状（仅本插件内部使用） ---- */
export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  position?: { start?: { line?: number }; end?: { line?: number } };
}

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'div', 'section',
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** Windows/POSIX 通用的目录取值与相对路径拼接（Worker 内无 node:path） */
export function dirnameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx > 0 ? path.slice(0, idx) : path;
}

export function joinDocPath(baseDir: string, relative: string): string {
  const sep = baseDir.includes('\\') ? '\\' : '/';
  const baseParts = baseDir.split(/[\\/]/).filter((p) => p.length > 0);
  const relParts = relative.replace(/^\.\//, '').split('/');
  const stack = [...baseParts];
  for (const part of relParts) {
    if (part === '..') {
      if (stack.length > 1) stack.pop();
    } else if (part !== '.' && part !== '') {
      stack.push(part);
    }
  }
  const joined = stack.join(sep);
  // 绝对形态复原：Windows 盘符保持原样；POSIX 补前导 /
  return baseDir.startsWith('/') ? `${sep}${joined}` : joined;
}

function isRelativeSrc(src: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('/') && !src.startsWith('#');
}

export interface PostProcessOutput {
  anchors: BlockAnchor[];
  toc: TocItem[];
}

export interface PostProcessOptions {
  docPath: string | null;
  output: PostProcessOutput;
}

/** rehype 插件工厂 */
export function postProcessPlugin(options: PostProcessOptions) {
  return function transform(tree: HastNode): void {
    const { output } = options;
    const docDir = options.docPath ? dirnameOf(options.docPath) : null;
    let lastLine = 1;

    const walk = (node: HastNode, depth: number): void => {
      if (node.type === 'element' && node.tagName) {
        const tag = node.tagName;
        const props = (node.properties ??= {});

        // 顶层与常见块级元素记锚点（depth ≤ 2：根直属 + 列表项级）
        if (BLOCK_TAGS.has(tag) && depth <= 2) {
          const start = node.position?.start?.line ?? lastLine;
          const end = node.position?.end?.line ?? start;
          lastLine = start;
          props['dataMdLine'] = String(start);
          props['dataMdLineEnd'] = String(end);
          output.anchors.push({ line: start, endLine: end, tag });

          if (HEADING_TAGS.has(tag)) {
            const id = `mdh-${start}`;
            props['id'] = id;
            output.toc.push({
              level: Number(tag.slice(1)),
              text: textOf(node).trim(),
              line: start,
              id,
            });
          }
        }

        // 相对路径本地图片 → 自定义协议（预览内联，F3.10）
        if (tag === 'img' && typeof props['src'] === 'string') {
          const src = props['src'] as string;
          if (docDir && isRelativeSrc(src)) {
            const abs = joinDocPath(docDir, decodeURIComponent(src));
            props['src'] = `${DOC_ASSET_PROTOCOL}://local/?p=${encodeURIComponent(abs)}`;
          } else if (!docDir && isRelativeSrc(src)) {
            // 未保存文档无解析基准：置空避免 404 噪音
            props['dataMdUnresolved'] = 'true';
          }
          props['loading'] = 'lazy';
        }

        // 任务列表复选框只读（F3.7）
        if (tag === 'input') {
          props['disabled'] = true;
        }
      }
      (node.children ?? []).forEach((child) => walk(child, node.type === 'root' ? 1 : depth + 1));
    };

    walk(tree, 0);
  };
}
