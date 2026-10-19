/**
 * 渲染后处理插件（rehype，消毒之后运行）：
 * 1. 为块级元素写入 data-md-line / data-md-line-end（滚动锚点与光标同步元数据）；
 * 2. 标题写入稳定 id 并收集 TOC；
 * 3. 本地图片（相对路径 / 盘符绝对路径 / file:）改写为受控本地协议（本地图片内联预览）；
 *    Windows（WebView2）下自定义协议只能以 http://mdkit-doc.localhost/ 形式访问；
 * 4. 任务列表复选框强制只读；
 * 5. 内嵌 HTML 的 style 属性按 CSS 属性白名单过滤（只留排版/配色，拒绝 url()/expression 等）。
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
  const relParts = relative.replace(/^\.[\\/]/, '').split(/[\\/]/);
  const stack = [...baseParts];
  // Windows 盘符不可被 .. 弹出；POSIX 可上溯至根
  const minDepth = /^[A-Za-z]:$/.test(baseParts[0] ?? '') ? 1 : 0;
  for (const part of relParts) {
    if (part === '..') {
      if (stack.length > minDepth) stack.pop();
    } else if (part !== '.' && part !== '') {
      stack.push(part);
    }
  }
  const joined = stack.join(sep);
  // 绝对形态复原：Windows 盘符保持原样；POSIX 补前导 /
  return baseDir.startsWith('/') ? `${sep}${joined}` : joined;
}

function isRelativeSrc(src: string): boolean {
  return (
    !/^[a-z][a-z0-9+.-]*:/i.test(src) &&
    !src.startsWith('/') &&
    !src.startsWith('\\') &&
    !src.startsWith('#')
  );
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** 盘符绝对路径（C:\a.png / C:/a.png）或 file: URL → 规范化绝对路径；其余返回 null */
export function absoluteLocalPath(src: string): string | null {
  let path: string;
  if (/^file:/i.test(src)) {
    path = safeDecode(src.replace(/^file:\/*/i, ''));
    // file:///C:/x → C:/x；file:///home/x → /home/x
    if (!/^[A-Za-z]:/.test(path)) path = `/${path}`;
  } else if (/^[A-Za-z]:[\\/]/.test(src)) {
    path = safeDecode(src);
  } else {
    return null;
  }
  if (/^[A-Za-z]:/.test(path)) {
    return joinDocPath(`${path.slice(0, 2)}\\`, path.slice(2).replace(/^[\\/]+/, ''));
  }
  return joinDocPath('/', path);
}

/** Windows WebView2 把自定义协议映射为 http://<scheme>.localhost/（与 Tauri convertFileSrc 一致） */
export function isWindowsWebview(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent ?? '');
}

export function docAssetUrl(absPath: string, windows = isWindowsWebview()): string {
  const base = windows
    ? `http://${DOC_ASSET_PROTOCOL}.localhost/`
    : `${DOC_ASSET_PROTOCOL}://local/`;
  return `${base}?p=${encodeURIComponent(absPath)}`;
}

/** 内嵌 HTML style 白名单：仅排版、配色、盒模型类属性 */
const STYLE_PROPERTY_ALLOW =
  /^(color|background(-color)?|font(-(weight|style|size|family|variant))?|text-(align|decoration[\w-]*|indent|transform|shadow)|letter-spacing|word-spacing|line-height|white-space|vertical-align|width|height|min-width|max-width|min-height|max-height|(border|padding|margin)(-[a-z-]+)?|border-collapse|border-spacing|table-layout|display|float|clear|list-style(-type)?|opacity|word-break|overflow-wrap)$/;
const STYLE_VALUE_DENY = /url\s*\(|expression\s*\(|javascript:|@import|[\\<>]/i;

export function filterStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx <= 0) return null;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!value || !STYLE_PROPERTY_ALLOW.test(prop) || STYLE_VALUE_DENY.test(value)) return null;
      if (prop === 'display' && !/^(inline|block|inline-block|none|table[\w-]*)$/i.test(value)) return null;
      return `${prop}: ${value}`;
    })
    .filter((d): d is string => d !== null)
    .join('; ');
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

        // 内嵌 HTML 的 style：白名单过滤，空则移除
        if (typeof props['style'] === 'string') {
          const style = filterStyle(props['style'] as string);
          if (style) props['style'] = style;
          else delete props['style'];
        }

        // 本地图片 → 自定义协议（预览内联，F3.10）
        if (tag === 'img' && typeof props['src'] === 'string') {
          const src = (props['src'] as string).trim();
          const abs = absoluteLocalPath(src);
          if (abs) {
            props['src'] = docAssetUrl(abs);
          } else if (docDir && isRelativeSrc(src)) {
            props['src'] = docAssetUrl(joinDocPath(docDir, safeDecode(src.split(/[?#]/)[0] ?? src)));
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
