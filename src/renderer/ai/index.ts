/**
 * AI 桥接层模块入口（≤5 个核心接口）。
 * 职责：AI 后端连接与协议适配的渲染侧界面（对话/文档修改 Diff/行内辅助）。
 * 不知道：CodeMirror 内部对象、预览 DOM（写入经组合根注入的回调）。
 *
 * 公开接口：
 *   1. ChatPanel            —— 对话与文档修改面板
 *   2. InlineAssist         —— 行内辅助弹层
 *   3. useAiStore           —— AI 状态（配置注水/状态订阅）
 *   4. computeLineDiff      —— 行级 Diff（测试与外部预览用）
 *   5. buildEditsFromChunks —— 接受集 → 单事务编辑集
 */
export { ChatPanel } from './ChatPanel';
export type { ChatPanelProps } from './ChatPanel';
export { InlineAssist } from './InlineAssist';
export type { InlineAssistProps } from './InlineAssist';
export { useAiStore } from './ai-store';
export { computeLineDiff, buildEditsFromChunks } from './diff';
export type { DiffChunk } from './diff';
export type { DocContext } from './prompt-context';
