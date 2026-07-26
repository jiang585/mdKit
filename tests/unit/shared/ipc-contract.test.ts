import { describe, it, expect } from 'vitest';
import {
  aiChatStartReqSchema,
  draftSaveReqSchema,
  openDroppedReqSchema,
  openExternalReqSchema,
  saveFileReqSchema,
} from '@shared/ipc-contract';

describe('IPC 载荷校验（决策 §4：非法载荷必须拒绝）', () => {
  it('保存请求：合法通过，缺字段/类型错拒绝', () => {
    expect(saveFileReqSchema.safeParse({ path: 'C:\\a.md', content: 'x' }).success).toBe(true);
    expect(saveFileReqSchema.safeParse({ path: '', content: 'x' }).success).toBe(false);
    expect(saveFileReqSchema.safeParse({ path: 'C:\\a.md' }).success).toBe(false);
    expect(saveFileReqSchema.safeParse({ path: 123, content: 'x' }).success).toBe(false);
  });

  it('拖拽打开仅放行 Markdown 扩展名', () => {
    expect(openDroppedReqSchema.safeParse({ path: 'C:\\n.md' }).success).toBe(true);
    expect(openDroppedReqSchema.safeParse({ path: 'C:\\n.markdown' }).success).toBe(true);
    expect(openDroppedReqSchema.safeParse({ path: 'C:\\evil.exe' }).success).toBe(false);
  });

  it('外链打开要求合法 URL', () => {
    expect(openExternalReqSchema.safeParse({ url: 'https://a.com/x' }).success).toBe(true);
    expect(openExternalReqSchema.safeParse({ url: 'not a url' }).success).toBe(false);
  });

  it('AI 请求：消息数量与角色受限', () => {
    const ok = aiChatStartReqSchema.safeParse({
      requestId: 'r1',
      profileId: 'p1',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(ok.success).toBe(true);
    const badRole = aiChatStartReqSchema.safeParse({
      requestId: 'r1',
      profileId: 'p1',
      messages: [{ role: 'hacker', content: 'hi' }],
    });
    expect(badRole.success).toBe(false);
    const empty = aiChatStartReqSchema.safeParse({ requestId: 'r1', profileId: 'p1', messages: [] });
    expect(empty.success).toBe(false);
  });

  it('草稿保存：tabId 白名单字符', () => {
    expect(draftSaveReqSchema.safeParse({ tabId: 'tab-1', path: null, content: '' }).success).toBe(true);
    expect(draftSaveReqSchema.safeParse({ tabId: '', path: null, content: '' }).success).toBe(false);
  });
});
