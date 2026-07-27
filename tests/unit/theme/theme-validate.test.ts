import { describe, it, expect } from 'vitest';
import { validateTheme } from '@renderer/theme/index';
import lightDefault from '@renderer/theme/builtin/light-default.json';
import lightSepia from '@renderer/theme/builtin/light-sepia.json';
import darkDefault from '@renderer/theme/builtin/dark-default.json';
import darkOcean from '@renderer/theme/builtin/dark-ocean.json';

describe('主题 JSON Schema 校验（决策 §10 / E4）', () => {
  it('四套内置主题全部合法（浅色≥2、深色≥2，F4.7）', () => {
    const themes = [lightDefault, lightSepia, darkDefault, darkOcean];
    for (const theme of themes) {
      const result = validateTheme(theme);
      expect(result.ok).toBe(true);
    }
    const kinds = themes.map((t) => t.kind);
    expect(kinds.filter((k) => k === 'light').length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k === 'dark').length).toBeGreaterThanOrEqual(2);
  });

  it('缺失令牌被拒绝并给出错误信息', () => {
    const broken = JSON.parse(JSON.stringify(lightDefault)) as Record<string, unknown>;
    delete (broken.tokens as Record<string, unknown>).appBg;
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    expect((result.errors ?? []).length).toBeGreaterThan(0);
  });

  it('非法颜色格式被拒绝', () => {
    const broken = JSON.parse(JSON.stringify(lightDefault)) as { tokens: Record<string, string> };
    broken.tokens.appBg = 'red';
    expect(validateTheme(broken).ok).toBe(false);
  });

  it('非法 id 被拒绝（防路径注入）', () => {
    const broken = JSON.parse(JSON.stringify(lightDefault)) as { id: string };
    broken.id = '../evil';
    expect(validateTheme(broken).ok).toBe(false);
  });

  it('多余字段被拒绝（additionalProperties: false）', () => {
    const broken = { ...(lightDefault as object), hack: 1 };
    expect(validateTheme(broken).ok).toBe(false);
  });
});
