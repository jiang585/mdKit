/**
 * 主题描述文件形状（E4：新增主题只需提供 JSON 描述文件，零代码改动）。
 * 语义令牌 → CSS 变量由主题引擎完成映射；组件不硬编码颜色（决策输入 §10）。
 */

export interface ThemeTokens {
  /** 应用外壳 */
  appBg: string;
  appFg: string;
  border: string;
  accent: string;
  accentFg: string;
  /** 编辑区 */
  editorBg: string;
  editorFg: string;
  editorGutterBg: string;
  editorGutterFg: string;
  editorActiveLine: string;
  editorSelection: string;
  editorCursor: string;
  /** 编辑区语法着色 */
  synHeading: string;
  synEmphasis: string;
  synLink: string;
  synCode: string;
  synQuote: string;
  synMeta: string;
  /** 预览区 */
  previewBg: string;
  previewFg: string;
  previewHeading: string;
  previewLink: string;
  previewCodeBg: string;
  previewCodeFg: string;
  previewQuoteBar: string;
  previewQuoteFg: string;
  previewTableBorder: string;
  previewTableStripe: string;
  /** 状态与提示 */
  statusBarBg: string;
  statusBarFg: string;
  errorFg: string;
  warningFg: string;
  successFg: string;
}

export interface ThemeDefinition {
  /** 唯一 ID：小写字母/数字/连字符 */
  id: string;
  name: string;
  kind: 'light' | 'dark';
  tokens: ThemeTokens;
  /** 预览区代码高亮风格微调（可选覆盖 highlight.js 基调） */
  codeHighlight?: Partial<Record<'keyword' | 'string' | 'comment' | 'number' | 'title' | 'attr', string>>;
}

export interface ThemeSummary {
  id: string;
  name: string;
  kind: 'light' | 'dark';
  builtin: boolean;
}
