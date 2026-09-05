/**
 * 渲染管线模块入口（≤5 个核心接口 —— 决策输入 §5）。
 * 职责：接收 Markdown 文本，输出可展示内容（含公式/图表子渲染器）。
 * 不知道：编辑器实现、文件来源、布局方式。
 *
 * 公开接口：
 *   1. createRenderScheduler —— 防抖 + 修订号淘汰 + Worker 调度
 *   2. PreviewPanel          —— 预览视图组件（滚动保持/交互）
 *   3. renderMarkdownOnce    —— 一次性渲染（导出服务复用）
 *   4. findAnchorLineForCursor —— 光标 → 锚点行（状态栏/同步）
 */
export { createRenderScheduler } from './scheduler';
export type { RenderScheduler, SchedulerOptions } from './scheduler';
export { PreviewPanel } from './PreviewPanel';
export type { PreviewControls, PreviewPanelProps } from './PreviewPanel';
export { renderMarkdown as renderMarkdownOnce } from './worker/pipeline';
export { findAnchorLineForCursor } from './cursor-sync';
