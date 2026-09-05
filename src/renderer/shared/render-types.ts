/**
 * 渲染管线对外数据形状（AST 不出模块；跨模块只传纯数据 —— C2/§7）。
 */

/** 块级锚点：预览 DOM 元素 ↔ 源码行号 的映射元数据 */
export interface BlockAnchor {
  /** 预览元素上的 data-md-line 值（源码起始行，1-based） */
  line: number;
  /** 源码结束行（含） */
  endLine: number;
  /** 元素标签名（用于 TOC / 诊断） */
  tag: string;
}

export interface RenderDiagnostic {
  kind: 'katex' | 'pipeline';
  message: string;
  line?: number;
}

export interface TocItem {
  level: number;
  text: string;
  line: number;
  id: string;
}

export interface RenderResult {
  revision: number;
  html: string;
  anchors: BlockAnchor[];
  toc: TocItem[];
  diagnostics: RenderDiagnostic[];
  /** Worker 内解析耗时（性能测试要求分项记录 §9） */
  parseMs: number;
}

export interface RenderRequest {
  revision: number;
  markdown: string;
  /** 当前文档路径（本地图片相对路径解析基准），null 表示未保存 */
  docPath: string | null;
}
