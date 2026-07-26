/**
 * 主题引擎内部实现：注册表 + Ajv 校验 + 应用 + 失败回退。
 * 主题切换只更新 CSS 变量（决策输入 §9），不触发 Markdown 重解析。
 */
import Ajv, { type ValidateFunction } from 'ajv';
import type { ThemeDefinition, ThemeSummary } from '@shared/theme-types';
import { FALLBACK_THEME_ID } from '@shared/constants';
import { themeJsonSchema } from './theme-schema';
import { applyVars, editorScopeVars, previewScopeVars } from './apply';
import lightDefault from './builtin/light-default.json';
import lightSepia from './builtin/light-sepia.json';
import darkDefault from './builtin/dark-default.json';
import darkOcean from './builtin/dark-ocean.json';

const ajv = new Ajv({ allErrors: true });
let compiled: ValidateFunction | null = null;

function validator(): ValidateFunction {
  if (!compiled) compiled = ajv.compile(themeJsonSchema as unknown as object);
  return compiled;
}

export interface ThemeValidation {
  ok: boolean;
  theme?: ThemeDefinition;
  errors?: string[];
}

/** 校验主题 JSON（自定义导入与内置主题共用同一 Schema） */
export function validateTheme(raw: unknown): ThemeValidation {
  const validate = validator();
  if (validate(raw)) {
    return { ok: true, theme: raw as unknown as ThemeDefinition };
  }
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || '(根)'} ${e.message ?? '非法'}`,
  );
  return { ok: false, errors };
}

export class ThemeRegistry {
  private themes = new Map<string, { def: ThemeDefinition; builtin: boolean }>();

  constructor() {
    for (const raw of [lightDefault, lightSepia, darkDefault, darkOcean]) {
      const result = validateTheme(raw);
      if (result.ok && result.theme) {
        this.themes.set(result.theme.id, { def: result.theme, builtin: true });
      } else {
        // 内置主题必须合法；此分支仅防御构建期数据损坏
        console.error('内置主题校验失败', result.errors);
      }
    }
  }

  /** 注册自定义主题（返回错误信息或 null） */
  register(raw: unknown): string | null {
    const result = validateTheme(raw);
    if (!result.ok || !result.theme) {
      return result.errors?.join('；') ?? '主题格式非法';
    }
    if (this.themes.get(result.theme.id)?.builtin) {
      return `主题 id「${result.theme.id}」与内置主题冲突`;
    }
    this.themes.set(result.theme.id, { def: result.theme, builtin: false });
    return null;
  }

  get(id: string): ThemeDefinition | null {
    return this.themes.get(id)?.def ?? null;
  }

  /** 取主题；未知 id 回退默认浅色（开发规范 §6） */
  getOrFallback(id: string): { theme: ThemeDefinition; fellBack: boolean } {
    const found = this.get(id);
    if (found) return { theme: found, fellBack: false };
    const fallback = this.get(FALLBACK_THEME_ID);
    if (!fallback) throw new Error('缺失兜底主题');
    return { theme: fallback, fellBack: true };
  }

  list(): ThemeSummary[] {
    return [...this.themes.values()].map(({ def, builtin }) => ({
      id: def.id,
      name: def.name,
      kind: def.kind,
      builtin,
    }));
  }

  /** 循环切换序列（主题菜单「切换下一个」） */
  nextIdAfter(currentId: string): string {
    const ids = [...this.themes.keys()];
    const index = ids.indexOf(currentId);
    return ids[(index + 1) % ids.length] ?? FALLBACK_THEME_ID;
  }
}

export interface AppliedTheme {
  editorThemeId: string;
  previewThemeId: string;
  previewDark: boolean;
  editorDark: boolean;
  fellBack: boolean;
}

/** 应用主题到文档根（编辑/预览两个命名空间独立写入） */
export function applyThemes(
  registry: ThemeRegistry,
  editorThemeId: string,
  previewThemeId: string,
  root: HTMLElement = document.documentElement,
): AppliedTheme {
  const editor = registry.getOrFallback(editorThemeId);
  const preview = registry.getOrFallback(previewThemeId);
  applyVars(root, editorScopeVars(editor.theme));
  applyVars(root, previewScopeVars(preview.theme));
  root.dataset['mkEditorTheme'] = editor.theme.id;
  root.dataset['mkPreviewTheme'] = preview.theme.id;
  root.dataset['mkKind'] = editor.theme.kind;
  root.style.colorScheme = editor.theme.kind;
  return {
    editorThemeId: editor.theme.id,
    previewThemeId: preview.theme.id,
    editorDark: editor.theme.kind === 'dark',
    previewDark: preview.theme.kind === 'dark',
    fellBack: editor.fellBack || preview.fellBack,
  };
}
