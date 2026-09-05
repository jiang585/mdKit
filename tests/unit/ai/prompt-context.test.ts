import { describe, it, expect } from 'vitest';
import {
  buildChatMessages,
  buildDocEditMessages,
  buildInlineMessages,
  CURSOR_MARK,
  stripOuterFence,
} from '@renderer/ai/prompt-context';

describe('上下文构建（F7.2）', () => {
  it('文档上下文携带光标标记', () => {
    const { messages } = buildChatMessages(
      [],
      '继续写',
      { docText: 'abcdef', cursorOffset: 3, selectionText: '', fileName: 'n.md' },
      false,
    );
    const contextMsg = messages.find((m) => m.content.includes('【文档上下文】'));
    expect(contextMsg).toBeDefined();
    expect(contextMsg?.content).toContain(`abc${CURSOR_MARK}def`);
  });

  it('超长文档按光标窗口截取并标注省略', () => {
    const doc = 'x'.repeat(60000);
    const { messages } = buildChatMessages(
      [],
      'q',
      { docText: doc, cursorOffset: 30000, selectionText: '', fileName: 'big.md' },
      false,
    );
    const contextMsg = messages.find((m) => m.content.includes('【文档上下文】'));
    expect(contextMsg?.content.length).toBeLessThan(20000);
    expect(contextMsg?.content).toContain('省略');
    expect(contextMsg?.content).toContain(CURSOR_MARK);
  });

  it('脱敏开关作用于上下文与选中文本并统计命中', () => {
    const { messages, redactedHits } = buildChatMessages(
      [],
      'q',
      {
        docText: '密钥 sk-abcdefghijklmnop123 在此',
        cursorOffset: 0,
        selectionText: 'mail me a@b.com',
        fileName: 'n.md',
      },
      true,
    );
    expect(redactedHits).toBeGreaterThanOrEqual(2);
    const joined = messages.map((m) => m.content).join('\n');
    expect(joined).not.toContain('sk-abcdefghijklmnop123');
    expect(joined).not.toContain('a@b.com');
  });

  it('历史消息保序拼接，用户输入置尾', () => {
    const { messages } = buildChatMessages(
      [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
      ],
      '第二问',
      null,
      false,
    );
    const tail = messages.slice(-3);
    expect(tail.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(tail[2].content).toBe('第二问');
  });
});

describe('文档修改指令（F7.3/F7.4）', () => {
  it('要求输出完整文档且不包裹围栏', () => {
    const { messages } = buildDocEditMessages('翻译成英文', '# 你好', false);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('完整文档');
    expect(messages[1].content).toContain('【当前文档】');
    expect(messages[1].content).toContain('【修改指令】');
  });
});

describe('行内辅助指令（F7.5）', () => {
  it('有选中文本时附带原文', () => {
    const { messages } = buildInlineMessages('润色', '这句话写得不太行', false);
    expect(messages[1].content).toContain('【选中文本】');
    expect(messages[1].content).toContain('这句话写得不太行');
  });
  it('无选中文本仅指令', () => {
    const { messages } = buildInlineMessages('写个开头', '', false);
    expect(messages[1].content).not.toContain('【选中文本】');
  });
});

describe('围栏剥离', () => {
  it('剥掉整篇 ```markdown 包裹', () => {
    expect(stripOuterFence('```markdown\n# T\n内容\n```')).toBe('# T\n内容');
    expect(stripOuterFence('```\nX\n```')).toBe('X');
  });
  it('普通文本与内嵌围栏不受影响', () => {
    expect(stripOuterFence('# T\n```js\ncode\n```\n尾部')).toBe('# T\n```js\ncode\n```\n尾部');
  });
});
