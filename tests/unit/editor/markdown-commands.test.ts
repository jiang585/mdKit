import { describe, it, expect } from 'vitest';
import {
  codeFenceTemplate,
  insertBlock,
  linkTemplate,
  setHeading,
  tableTemplate,
  toggleInline,
} from '@renderer/editor/markdown-commands';

describe('行内标记切换（F2.5，Ctrl+B/I 等）', () => {
  it('选区加粗：包裹 ** 并保持选中原文本', () => {
    const doc = 'hello world';
    const edit = toggleInline(doc, 6, 11, '**');
    expect(edit.insert).toBe('**world**');
    expect(doc.slice(0, edit.from) + edit.insert).toBe('hello **world**');
    expect(edit.selFrom).toBe(8);
    expect(edit.selTo).toBe(13);
  });

  it('外侧已有标记 → 去除（再次 Ctrl+B 取消加粗）', () => {
    const doc = 'a **bold** b';
    const edit = toggleInline(doc, 4, 8, '**'); // 选中 bold（不含星号）
    expect(edit.from).toBe(2);
    expect(edit.to).toBe(10);
    expect(edit.insert).toBe('bold');
  });

  it('选区内含完整标记 → 去除', () => {
    const doc = 'a **bold** b';
    const edit = toggleInline(doc, 2, 10, '**'); // 选中 **bold**
    expect(edit.insert).toBe('bold');
    expect(edit.selTo - edit.selFrom).toBe(4);
  });

  it('空选区：插入标记对并把光标置于中间', () => {
    const edit = toggleInline('ab', 1, 1, '*');
    expect(edit.insert).toBe('**');
    expect(edit.selFrom).toBe(2);
    expect(edit.selTo).toBe(2);
  });
});

describe('标题设置', () => {
  it('普通行 → 二级标题', () => {
    const doc = 'hello';
    const edit = setHeading(doc, 0, 5, 2);
    expect(edit.insert).toBe('## hello');
  });
  it('已有标题替换级别（不叠加 #）', () => {
    const doc = '### old';
    const edit = setHeading(doc, 0, doc.length, 1);
    expect(edit.insert).toBe('# old');
  });
  it('level 0 清除标题前缀', () => {
    const doc = '## title';
    const edit = setHeading(doc, 0, doc.length, 0);
    expect(edit.insert).toBe('title');
  });
});

describe('块插入模板', () => {
  it('表格模板：表头 + 分隔行 + 数据行', () => {
    const table = tableTemplate(3, 3);
    const lines = table.trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('| 列1 | 列2 | 列3 |');
    expect(lines[1]).toBe('| --- | --- | --- |');
  });
  it('代码围栏模板光标落于栏内', () => {
    expect(codeFenceTemplate('ts')).toBe('```ts\n\n```\n');
  });
  it('行中插入块自动补前置换行', () => {
    const edit = insertBlock('abc', 3, '```\n\n```\n', 4);
    expect(edit.insert.startsWith('\n')).toBe(true);
    expect(edit.selFrom).toBe(3 + 1 + 4);
  });
  it('行首插入不补换行', () => {
    const edit = insertBlock('abc\n', 4, 'X', 0);
    expect(edit.insert).toBe('X');
  });
});

describe('链接模板', () => {
  it('有选中文本时 URL 占位被选中便于直接输入', () => {
    const { snippet, selStart, selEnd } = linkTemplate('官网');
    expect(snippet).toBe('[官网](https://)');
    expect(snippet.slice(selStart, selEnd)).toBe('https://');
  });
  it('无选中文本用默认文案', () => {
    expect(linkTemplate('').snippet).toBe('[链接文字](https://)');
  });
});
