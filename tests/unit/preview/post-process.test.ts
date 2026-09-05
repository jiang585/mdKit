import { describe, it, expect } from 'vitest';
import {
  dirnameOf,
  joinDocPath,
  postProcessPlugin,
  textOf,
  type HastNode,
  type PostProcessOutput,
} from '@renderer/preview/worker/post-process';

const el = (
  tagName: string,
  line: number | null,
  children: HastNode[] = [],
  properties: Record<string, unknown> = {},
): HastNode => ({
  type: 'element',
  tagName,
  properties,
  children,
  ...(line !== null ? { position: { start: { line }, end: { line } } } : {}),
});
const text = (value: string): HastNode => ({ type: 'text', value });
const root = (children: HastNode[]): HastNode => ({ type: 'root', children });

function run(tree: HastNode, docPath: string | null = null): PostProcessOutput {
  const output: PostProcessOutput = { anchors: [], toc: [] };
  postProcessPlugin({ docPath, output })(tree);
  return output;
}

describe('后处理插件：锚点与 TOC', () => {
  it('块级元素写入 data-md-line 并收集锚点', () => {
    const p = el('p', 3, [text('hi')]);
    const tree = root([el('h1', 1, [text('标题')]), p]);
    const output = run(tree);
    expect(output.anchors).toHaveLength(2);
    expect(p.properties?.['dataMdLine']).toBe('3');
    expect(output.anchors[0]).toEqual({ line: 1, endLine: 1, tag: 'h1' });
  });

  it('标题生成稳定 id 并进入 TOC（含层级与文本）', () => {
    const tree = root([
      el('h1', 1, [text('一级')]),
      el('h2', 4, [text('二级 '), el('code', null, [text('x')])]),
    ]);
    const output = run(tree);
    expect(output.toc).toEqual([
      { level: 1, text: '一级', line: 1, id: 'mdh-1' },
      { level: 2, text: '二级 x', line: 4, id: 'mdh-4' },
    ]);
  });

  it('列表项（depth 2）计入锚点，深层嵌套不计', () => {
    const deepP = el('p', 7);
    const li = el('li', 6, [deepP]);
    const ul = el('ul', 5, [li]);
    const output = run(root([ul]));
    const tags = output.anchors.map((a) => a.tag);
    expect(tags).toEqual(['ul', 'li']);
    expect(deepP.properties?.['dataMdLine']).toBeUndefined();
  });

  it('textOf 拼接嵌套文本', () => {
    expect(textOf(el('h3', 1, [text('a'), el('em', null, [text('b')])]))).toBe('ab');
  });
});

describe('后处理插件：本地图片改写（F3.10）', () => {
  it('相对路径 → mdkit-doc 协议（含中文与子目录）', () => {
    const img = el('img', 2, [], { src: 'img/图 1.png' });
    run(root([el('p', 2, [img])]), 'C:\\docs\\note.md');
    expect(String(img.properties?.['src'])).toBe(
      `mdkit-doc://local/?p=${encodeURIComponent('C:\\docs\\img\\图 1.png')}`,
    );
    expect(img.properties?.['loading']).toBe('lazy');
  });

  it('../ 上溯以文档目录为基准解析', () => {
    const img = el('img', 1, [], { src: '../assets/a.png' });
    run(root([el('p', 1, [img])]), '/home/u/docs/note.md');
    expect(String(img.properties?.['src'])).toContain(encodeURIComponent('/home/u/assets/a.png'));
  });

  it('http/data 绝对地址不改写', () => {
    const img = el('img', 1, [], { src: 'https://x.com/a.png' });
    run(root([el('p', 1, [img])]), '/home/u/n.md');
    expect(img.properties?.['src']).toBe('https://x.com/a.png');
  });

  it('未保存文档的相对图片标记 unresolved', () => {
    const img = el('img', 1, [], { src: './a.png' });
    run(root([el('p', 1, [img])]), null);
    expect(img.properties?.['dataMdUnresolved']).toBe('true');
    expect(img.properties?.['src']).toBe('./a.png');
  });
});

describe('后处理插件：任务列表只读（F3.7）', () => {
  it('checkbox 强制 disabled', () => {
    const input = el('input', null, [], { type: 'checkbox', checked: true });
    run(root([el('ul', 1, [el('li', 1, [input])])]));
    expect(input.properties?.['disabled']).toBe(true);
  });
});

describe('路径工具（Worker 内无 node:path）', () => {
  it('dirnameOf 兼容双分隔符', () => {
    expect(dirnameOf('C:\\a\\b\\c.md')).toBe('C:\\a\\b');
    expect(dirnameOf('/a/b/c.md')).toBe('/a/b');
  });
  it('joinDocPath 处理 ./ ../ 与分隔符风格', () => {
    expect(joinDocPath('C:\\a\\b', './x.png')).toBe('C:\\a\\b\\x.png');
    expect(joinDocPath('C:\\a\\b', '../x.png')).toBe('C:\\a\\x.png');
    expect(joinDocPath('/a/b', 'c/d.png')).toBe('/a/b/c/d.png');
    expect(joinDocPath('/a/b', '../../d.png')).toBe('/d.png');
  });
});
