import { describe, it, expect } from 'vitest';
import { defaultUserConfig, mergeConfig, userConfigSchema } from '@shared/config-schema';

describe('用户配置模式', () => {
  it('空对象解析出完整默认配置', () => {
    const cfg = userConfigSchema.parse({});
    expect(cfg.theme.editorThemeId).toBe('light-default');
    expect(cfg.layout.mode).toBe('split');
    expect(cfg.autosave.enabled).toBe(true);
    expect(cfg.recentFiles).toEqual([]);
    expect(cfg.ai.profiles).toEqual([]);
  });

  it('非法值被拒绝（分屏比例越界 / 未知布局模式）', () => {
    expect(() => userConfigSchema.parse({ layout: { ratio: 0.05 } })).toThrow();
    expect(() => userConfigSchema.parse({ layout: { mode: 'weird' } })).toThrow();
  });

  it('mergeConfig 一层深合并、数组整体替换', () => {
    const base = defaultUserConfig();
    const next = mergeConfig(base, {
      theme: { editorThemeId: 'dark-default' },
      recentFiles: [{ path: 'C:\\a.md', name: 'a.md', lastOpenedAt: 1 }],
    });
    expect(next.theme.editorThemeId).toBe('dark-default');
    expect(next.theme.previewThemeId).toBe(base.theme.previewThemeId); // 未指定字段保留
    expect(next.recentFiles).toHaveLength(1);
    expect(next.autosave).toEqual(base.autosave);
  });

  it('mergeConfig 结果仍受模式校验（坏补丁抛错）', () => {
    const base = defaultUserConfig();
    expect(() => mergeConfig(base, { autosave: { intervalMs: 10 } })).toThrow();
  });
});
