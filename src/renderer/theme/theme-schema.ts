/**
 * 主题 JSON Schema（决策输入 §10：主题源文件 JSON + JSON Schema 严格校验，Ajv 执行）。
 */
export const THEME_TOKEN_KEYS = [
  'appBg', 'appFg', 'border', 'accent', 'accentFg',
  'editorBg', 'editorFg', 'editorGutterBg', 'editorGutterFg',
  'editorActiveLine', 'editorSelection', 'editorCursor',
  'synHeading', 'synEmphasis', 'synLink', 'synCode', 'synQuote', 'synMeta',
  'previewBg', 'previewFg', 'previewHeading', 'previewLink',
  'previewCodeBg', 'previewCodeFg', 'previewQuoteBar', 'previewQuoteFg',
  'previewTableBorder', 'previewTableStripe',
  'statusBarBg', 'statusBarFg', 'errorFg', 'warningFg', 'successFg',
] as const;

const COLOR_PATTERN = '^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';

export const themeJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'kind', 'tokens'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,63}$' },
    name: { type: 'string', minLength: 1, maxLength: 64 },
    kind: { enum: ['light', 'dark'] },
    tokens: {
      type: 'object',
      additionalProperties: false,
      required: [...THEME_TOKEN_KEYS],
      properties: Object.fromEntries(
        THEME_TOKEN_KEYS.map((key) => [key, { type: 'string', pattern: COLOR_PATTERN }]),
      ),
    },
    codeHighlight: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        ['keyword', 'string', 'comment', 'number', 'title', 'attr'].map((key) => [
          key,
          { type: 'string', pattern: COLOR_PATTERN },
        ]),
      ),
    },
  },
} as const;
