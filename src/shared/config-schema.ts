/**
 * 用户配置模式：落盘于 userData/config.json（D5：用户数据与安装目录分离）。
 * API 密钥绝不进入本文件（决策输入 §11），单独经 safeStorage 加密存放。
 */
import { z } from 'zod';
import {
  AUTOSAVE_DEFAULT_INTERVAL_MS,
  AUTOSAVE_MIN_INTERVAL_MS,
  DEFAULT_LIGHT_THEME,
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
} from './constants';

export const layoutModeSchema = z.enum(['split', 'editor', 'preview']);
export type LayoutMode = z.infer<typeof layoutModeSchema>;

export const aiProfileSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  /** OpenAI 兼容 API 根地址，如 https://api.openai.com/v1 */
  baseUrl: z.string().url().max(1024),
  model: z.string().min(1).max(128),
  /** 使用场景标签（F7.8 多模型切换：通用写作/代码/翻译…） */
  scene: z.string().max(32).default('通用'),
  /** 脱敏模式（F7.9）：发送前摘除敏感元数据 */
  redact: z.boolean().default(false),
  /** 每次请求前展示发送内容预览（F7.9） */
  previewRequests: z.boolean().default(false),
});
export type AiProfile = z.infer<typeof aiProfileSchema>;

export const userConfigSchema = z.object({
  version: z.literal(1).default(1),
  theme: z
    .object({
      /** 编辑区与预览区可独立设置主题（F4.5）；linked 为 true 时联动 */
      linked: z.boolean().default(true),
      editorThemeId: z.string().default(DEFAULT_LIGHT_THEME),
      previewThemeId: z.string().default(DEFAULT_LIGHT_THEME),
    })
    .default({}),
  layout: z
    .object({
      mode: layoutModeSchema.default('split'),
      ratio: z.number().min(SPLIT_RATIO_MIN).max(SPLIT_RATIO_MAX).default(0.5),
      tocVisible: z.boolean().default(false),
      aiPanelVisible: z.boolean().default(false),
    })
    .default({}),
  autosave: z
    .object({
      enabled: z.boolean().default(true),
      intervalMs: z.number().int().min(AUTOSAVE_MIN_INTERVAL_MS).default(AUTOSAVE_DEFAULT_INTERVAL_MS),
    })
    .default({}),
  editor: z
    .object({
      fontSize: z.number().int().min(10).max(32).default(14),
      lineNumbers: z.boolean().default(true),
      wordWrap: z.boolean().default(true),
    })
    .default({}),
  /** 快捷键自定义绑定（E7）：命令 ID → 键位描述，如 "Mod-b" */
  shortcuts: z.record(z.string(), z.string()).default({}),
  recentFiles: z
    .array(z.object({ path: z.string(), name: z.string(), lastOpenedAt: z.number() }))
    .default([]),
  ai: z
    .object({
      activeProfileId: z.string().nullable().default(null),
      profiles: z.array(aiProfileSchema).default([]),
    })
    .default({}),
});
export type UserConfig = z.infer<typeof userConfigSchema>;

/** 深合并补丁（仅一层嵌套对象；数组与标量整体替换） */
export const userConfigPatchSchema = userConfigSchema.deepPartial();
export type UserConfigPatch = z.infer<typeof userConfigPatchSchema>;

export function defaultUserConfig(): UserConfig {
  return userConfigSchema.parse({});
}

export function mergeConfig(base: UserConfig, patch: UserConfigPatch): UserConfig {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const prev = (base as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object' && !Array.isArray(prev)) {
      merged[key] = { ...(prev as object), ...(value as object) };
    } else {
      merged[key] = value;
    }
  }
  return userConfigSchema.parse(merged);
}
