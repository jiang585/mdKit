import { describe, it, expect } from 'vitest';
import { editorScopeVars, previewScopeVars } from '@renderer/theme/apply';
import type { ThemeDefinition } from '@shared/theme-types';

const theme: ThemeDefinition = {
  id: 'test-theme',
  name: '测试',
  kind: 'dark',
  tokens: {
    appBg: '#111111', appFg: '#eeeeee', border: '#222222', accent: '#3355ff', accentFg: '#ffffff',
    editorBg: '#101010', editorFg: '#dddddd', editorGutterBg: '#131313', editorGutterFg: '#777777',
    editorActiveLine: '#181818', editorSelection: '#33445580', editorCursor: '#66aaff',
    synHeading: '#88aaff', synEmphasis: '#ffaa88', synLink: '#66ccff', synCode: '#ff8866',
    synQuote: '#88cc99', synMeta: '#667788',
    previewBg: '#121418', previewFg: '#d0d4da', previewHeading: '#ffffff', previewLink: '#5599ff',
    previewCodeBg: '#1c2026', previewCodeFg: '#d0d4da', previewQuoteBar: '#333a44', previewQuoteFg: '#99a2b0',
    previewTableBorder: '#333a44', previewTableStripe: '#171b21',
    statusBarBg: '#0c2233', statusBarFg: '#99ccee', errorFg: '#ff6666', warningFg: '#ddaa44', successFg: '#55cc88',
  },
};

describe('语义令牌 → CSS 变量映射（决策 §10）', () => {
  it('编辑命名空间：外壳/编辑器/语法/状态变量齐全且取值正确', () => {
    const vars = editorScopeVars(theme);
    expect(vars['--mk-app-bg']).toBe('#111111');
    expect(vars['--mk-editor-cursor']).toBe('#66aaff');
    expect(vars['--mk-syn-heading']).toBe('#88aaff');
    expect(vars['--mk-status-bar-bg']).toBe('#0c2233');
    expect(vars['--mk-error-fg']).toBe('#ff6666');
    expect(Object.keys(vars)).toHaveLength(23);
  });

  it('预览命名空间与编辑命名空间零重叠（支持独立主题 F4.5）', () => {
    const editorVars = Object.keys(editorScopeVars(theme));
    const previewVars = Object.keys(previewScopeVars(theme));
    const overlap = previewVars.filter((k) => editorVars.includes(k));
    expect(overlap).toEqual([]);
  });

  it('代码高亮变量缺省时回退语法令牌', () => {
    const vars = previewScopeVars(theme);
    expect(vars['--mk-hl-keyword']).toBe(theme.tokens.synHeading);
    expect(vars['--mk-hl-comment']).toBe(theme.tokens.synMeta);
  });

  it('codeHighlight 覆盖优先', () => {
    const withHl: ThemeDefinition = { ...theme, codeHighlight: { keyword: '#123456' } };
    expect(previewScopeVars(withHl)['--mk-hl-keyword']).toBe('#123456');
  });

  it('所有变量名以 --mk- 开头（约定检查）', () => {
    for (const key of [...Object.keys(editorScopeVars(theme)), ...Object.keys(previewScopeVars(theme))]) {
      expect(key.startsWith('--mk-')).toBe(true);
    }
  });
});
