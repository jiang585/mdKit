/**
 * 编辑器主题适配器（决策输入 §10）：完全经 CSS 变量消费主题引擎的语义令牌，
 * 主题切换零重配置（只需 :root 变量更新），与预览共用同一颜色来源。
 */
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export function editorBaseTheme(): ReturnType<typeof EditorView.theme> {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--mk-editor-bg)',
      color: 'var(--mk-editor-fg)',
      fontSize: 'var(--mk-editor-font-size, 14px)',
    },
    '.cm-content': {
      caretColor: 'var(--mk-editor-cursor)',
      fontFamily: "var(--mk-font-mono)",
      lineHeight: '1.75',
      padding: '12px 0 45vh',
    },
    '.cm-line': { padding: '0 16px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--mk-editor-cursor)',
      borderLeftWidth: '2px',
      transition: 'left 40ms ease-out, top 40ms ease-out',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
      { backgroundColor: 'var(--mk-editor-selection) !important' },
    '.cm-activeLine': { backgroundColor: 'var(--mk-editor-active-line)' },
    '.cm-gutters': {
      backgroundColor: 'var(--mk-editor-gutter-bg)',
      color: 'var(--mk-editor-gutter-fg)',
      borderRight: '1px solid var(--mk-border)',
      userSelect: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--mk-editor-active-line)',
      color: 'var(--mk-editor-fg)',
    },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-panels': {
      backgroundColor: 'var(--mk-app-bg)',
      color: 'var(--mk-app-fg)',
      borderBottom: '1px solid var(--mk-border)',
    },
    '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--mk-accent) 30%, transparent)' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--mk-accent) 55%, transparent)',
    },
    '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--mk-accent) 16%, transparent)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--mk-app-bg)',
      color: 'var(--mk-app-fg)',
      border: '1px solid var(--mk-border)',
      borderRadius: '6px',
      boxShadow: 'var(--mk-shadow-2)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--mk-accent)',
      color: 'var(--mk-accent-fg)',
    },
  });
}

/** Markdown 语法着色：颜色全部指向语义令牌变量 */
export function editorHighlightStyle(): ReturnType<typeof syntaxHighlighting> {
  const style = HighlightStyle.define([
    { tag: tags.heading1, color: 'var(--mk-syn-heading)', fontWeight: '700', fontSize: '1.35em' },
    { tag: tags.heading2, color: 'var(--mk-syn-heading)', fontWeight: '700', fontSize: '1.2em' },
    { tag: tags.heading3, color: 'var(--mk-syn-heading)', fontWeight: '700', fontSize: '1.1em' },
    { tag: [tags.heading4, tags.heading5, tags.heading6], color: 'var(--mk-syn-heading)', fontWeight: '700' },
    { tag: tags.strong, color: 'var(--mk-syn-emphasis)', fontWeight: '700' },
    { tag: tags.emphasis, color: 'var(--mk-syn-emphasis)', fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--mk-syn-meta)' },
    { tag: [tags.link, tags.url], color: 'var(--mk-syn-link)', textDecoration: 'underline' },
    { tag: [tags.monospace], color: 'var(--mk-syn-code)' },
    { tag: tags.quote, color: 'var(--mk-syn-quote)', fontStyle: 'italic' },
    { tag: [tags.meta, tags.processingInstruction, tags.punctuation], color: 'var(--mk-syn-meta)' },
    { tag: tags.contentSeparator, color: 'var(--mk-syn-meta)', fontWeight: '700' },
    { tag: [tags.list, tags.labelName], color: 'var(--mk-syn-meta)' },
    /* 围栏代码块内嵌语言的基础着色 */
    { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--mk-syn-heading)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--mk-syn-quote)' },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--mk-syn-meta)', fontStyle: 'italic' },
    { tag: [tags.number, tags.bool, tags.atom], color: 'var(--mk-syn-code)' },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: 'var(--mk-syn-link)' },
    { tag: [tags.typeName, tags.className], color: 'var(--mk-syn-emphasis)' },
  ]);
  return syntaxHighlighting(style, { fallback: true });
}
