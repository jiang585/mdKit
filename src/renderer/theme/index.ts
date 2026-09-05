/**
 * 主题引擎模块入口（≤5 个核心接口）。
 * 职责：管理配色方案，向编辑区与预览区统一分发样式变量（CSS 变量）。
 * 不知道：编辑逻辑、渲染逻辑、文件操作细节（仅经 bridge 读写主题文件与配置）。
 *
 * 公开接口：
 *   1. createThemeEngine —— 引擎实例（list/setTheme/next/importCustom/getActive）
 *   2. validateTheme     —— 主题 JSON 校验（设置面板即时校验用）
 */
import type { ThemeSummary } from '@shared/theme-types';
import { bridge } from '@renderer/shared/bridge';
import { appBus } from '@renderer/shared/event-bus';
import { applyThemes, ThemeRegistry, type AppliedTheme } from './engine';
import { previewScopeVars } from './apply';
export { validateTheme } from './engine';

export interface ThemeEngineApi {
  /** 初始化：加载自定义主题 + 应用持久化选择（返回实际生效主题） */
  init(editorThemeId: string, previewThemeId: string): Promise<AppliedTheme>;
  list(): ThemeSummary[];
  /** 切换主题（linked=true 时编辑/预览联动；持久化 + 事实通知） */
  setTheme(opts: {
    editorThemeId?: string;
    previewThemeId?: string;
    linked: boolean;
  }): Promise<AppliedTheme>;
  /** 循环切换到下一个主题（快捷键/菜单） */
  nextTheme(linked: boolean): Promise<AppliedTheme>;
  /** 经系统对话框导入自定义主题；返回错误消息或 null */
  importCustom(): Promise<string | null>;
  getActive(): AppliedTheme;
  /** 当前预览主题的 CSS 变量快照（导出所见即所得用） */
  previewVars(): Record<string, string>;
}

export function createThemeEngine(): ThemeEngineApi {
  const registry = new ThemeRegistry();
  let active: AppliedTheme = {
    editorThemeId: 'light-default',
    previewThemeId: 'light-default',
    editorDark: false,
    previewDark: false,
    fellBack: false,
  };

  const apply = (editorId: string, previewId: string): AppliedTheme => {
    active = applyThemes(registry, editorId, previewId);
    appBus.emit('theme:switched', {
      editorThemeId: active.editorThemeId,
      previewThemeId: active.previewThemeId,
    });
    return active;
  };

  const persist = async (): Promise<void> => {
    await bridge().config.patch({
      theme: { editorThemeId: active.editorThemeId, previewThemeId: active.previewThemeId },
    });
  };

  return {
    async init(editorThemeId, previewThemeId) {
      // 加载用户自定义主题（损坏主题静默跳过并在控制台留痕，主流程不中断）
      try {
        const customs = await bridge().theme.listCustom();
        for (const raw of customs) {
          try {
            const error = registry.register(JSON.parse(raw));
            if (error) console.warn('[theme] 自定义主题被拒绝：', error);
          } catch {
            console.warn('[theme] 自定义主题 JSON 解析失败');
          }
        }
      } catch {
        /* 无自定义主题目录时忽略 */
      }
      return apply(editorThemeId, previewThemeId);
    },
    list: () => registry.list(),
    async setTheme({ editorThemeId, previewThemeId, linked }) {
      const nextEditor = editorThemeId ?? active.editorThemeId;
      const nextPreview = linked ? nextEditor : (previewThemeId ?? active.previewThemeId);
      const applied = apply(nextEditor, nextPreview);
      await persist();
      return applied;
    },
    async nextTheme(linked) {
      const nextId = registry.nextIdAfter(active.editorThemeId);
      return this.setTheme({ editorThemeId: nextId, linked });
    },
    async importCustom() {
      const result = await bridge().theme.importFile();
      if (!result) return null; // 用户取消
      if ('error' in result) return result.error;
      try {
        const error = registry.register(JSON.parse(result.json));
        return error;
      } catch {
        return '主题 JSON 解析失败';
      }
    },
    getActive: () => active,
    previewVars() {
      const { theme } = registry.getOrFallback(active.previewThemeId);
      return previewScopeVars(theme);
    },
  };
}
