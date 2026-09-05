import { describe, it, expect } from 'vitest';
import { countWords, fileNameOf } from '@renderer/shared/text-utils';

describe('字数统计（U4 状态栏）', () => {
  it('空文本为 0', () => {
    expect(countWords('')).toBe(0);
  });
  it('英文按词计数', () => {
    expect(countWords('hello world foo')).toBe(3);
  });
  it('中文按字计数', () => {
    expect(countWords('你好世界')).toBe(4);
  });
  it('中英混排', () => {
    expect(countWords('Markdown 工具箱 is great')).toBe(3 + 3);
  });
  it('标点与空白不计', () => {
    expect(countWords('，。！ --- ***')).toBe(0);
  });
});

describe('文件名提取', () => {
  it('Windows 路径', () => {
    expect(fileNameOf('C:\\docs\\readme.md')).toBe('readme.md');
  });
  it('POSIX 路径', () => {
    expect(fileNameOf('/home/user/note.md')).toBe('note.md');
  });
  it('null 回退默认', () => {
    expect(fileNameOf(null)).toBe('未命名');
  });
});
