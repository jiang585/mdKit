/**
 * 布局管理模块入口（≤5 个核心接口）。
 * 职责：分屏比例、视图模式切换、面板显隐。不知道：文档内容与渲染结果。
 *
 * 公开接口：
 *   1. useLayoutStore —— 布局状态（模式/比例/面板显隐）
 *   2. SplitPane      —— 分屏容器组件
 */
export { useLayoutStore } from './layout-store';
export type { LayoutState } from './layout-store';
export { SplitPane } from './SplitPane';
export type { SplitPaneProps } from './SplitPane';
