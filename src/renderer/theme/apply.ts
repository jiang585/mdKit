/**
 * 语义令牌 → CSS 变量映射（纯函数，可单测）。
 * 编辑区/应用外壳消费「editor 主题」的变量；预览区消费「preview 主题」的变量，
 * 两组命名空间不重叠，从而支持编辑/预览独立主题（F4.5）。
 */
import type { ThemeDefinition } from '@shared/theme-types';

/** editor 主题贡献的变量（外壳 + 编辑器 + 语法 + 状态色） */
export function editorScopeVars(theme: ThemeDefinition): Record<string, string> {
  const t = theme.tokens;
  return {
    '--mk-app-bg': t.appBg,
    '--mk-app-fg': t.appFg,
    '--mk-border': t.border,
    '--mk-accent': t.accent,
    '--mk-accent-fg': t.accentFg,
    '--mk-editor-bg': t.editorBg,
    '--mk-editor-fg': t.editorFg,
    '--mk-editor-gutter-bg': t.editorGutterBg,
    '--mk-editor-gutter-fg': t.editorGutterFg,
    '--mk-editor-active-line': t.editorActiveLine,
    '--mk-editor-selection': t.editorSelection,
    '--mk-editor-cursor': t.editorCursor,
    '--mk-syn-heading': t.synHeading,
    '--mk-syn-emphasis': t.synEmphasis,
    '--mk-syn-link': t.synLink,
    '--mk-syn-code': t.synCode,
    '--mk-syn-quote': t.synQuote,
    '--mk-syn-meta': t.synMeta,
    '--mk-status-bar-bg': t.statusBarBg,
    '--mk-status-bar-fg': t.statusBarFg,
    '--mk-error-fg': t.errorFg,
    '--mk-warning-fg': t.warningFg,
    '--mk-success-fg': t.successFg,
  };
}

/** preview 主题贡献的变量 */
export function previewScopeVars(theme: ThemeDefinition): Record<string, string> {
  const t = theme.tokens;
  const hl = theme.codeHighlight ?? {};
  return {
    '--mk-preview-bg': t.previewBg,
    '--mk-preview-fg': t.previewFg,
    '--mk-preview-heading': t.previewHeading,
    '--mk-preview-link': t.previewLink,
    '--mk-preview-code-bg': t.previewCodeBg,
    '--mk-preview-code-fg': t.previewCodeFg,
    '--mk-preview-quote-bar': t.previewQuoteBar,
    '--mk-preview-quote-fg': t.previewQuoteFg,
    '--mk-preview-table-border': t.previewTableBorder,
    '--mk-preview-table-stripe': t.previewTableStripe,
    '--mk-hl-keyword': hl.keyword ?? t.synHeading,
    '--mk-hl-string': hl.string ?? t.synQuote,
    '--mk-hl-comment': hl.comment ?? t.synMeta,
    '--mk-hl-number': hl.number ?? t.synCode,
    '--mk-hl-title': hl.title ?? t.synEmphasis,
    '--mk-hl-attr': hl.attr ?? t.synLink,
  };
}

export function applyVars(root: HTMLElement, vars: Record<string, string>): void {
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}
