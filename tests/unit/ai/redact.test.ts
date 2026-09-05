import { describe, it, expect } from 'vitest';
import { redactText } from '@renderer/ai/redact';

describe('脱敏模式（F7.9）', () => {
  it('API 密钥形态', () => {
    const { text, hits } = redactText('我的密钥是 sk-abcdef1234567890abcd 请保密');
    expect(text).toContain('[已脱敏:密钥]');
    expect(text).not.toContain('sk-abcdef');
    expect(hits).toBe(1);
  });

  it('Bearer 令牌', () => {
    const { text } = redactText('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc');
    expect(text).toContain('Bearer [已脱敏]');
  });

  it('邮箱', () => {
    const { text } = redactText('联系 someone@example.com 获取');
    expect(text).toContain('[已脱敏:邮箱]');
    expect(text).not.toContain('example.com');
  });

  it('Windows 与 POSIX 路径', () => {
    const { text, hits } = redactText('文件在 C:\\Users\\me\\secret.md 和 /home/me/notes/a.md');
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(text).not.toContain('secret.md');
    expect(text).not.toContain('/home/me');
  });

  it('IPv4 地址（含端口）', () => {
    const { text } = redactText('服务器 192.168.1.10:8080 上');
    expect(text).toContain('[已脱敏:IP]');
  });

  it('普通文本零命中且原样保留', () => {
    const input = '这是一段普通的 Markdown 文本，包含 **加粗** 与 `代码`。';
    const { text, hits } = redactText(input);
    expect(hits).toBe(0);
    expect(text).toBe(input);
  });
});
