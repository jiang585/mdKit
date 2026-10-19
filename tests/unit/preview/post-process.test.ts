import { describe, it, expect } from 'vitest';
import {
  absoluteLocalPath,
  dirnameOf,
  docAssetUrl,
  filterStyle,
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

describe('后处理插件：本地图片路径形态', () => {
  it('Windows WebView2 使用 http://mdkit-doc.localhost/ 形态', () => {
    expect(docAssetUrl('C:\\a\\b.png', true)).toBe(
      `http://mdkit-doc.localhost/?p=${encodeURIComponent('C:\\a\\b.png')}`,
    );
    expect(docAssetUrl('/a/b.png', false)).toBe(`mdkit-doc://local/?p=${encodeURIComponent('/a/b.png')}`);
  });

  it('盘符绝对路径与 file: URL 解析为规范绝对路径', () => {
    expect(absoluteLocalPath('C:/Users/HP/Desktop/a.png')).toBe('C:\\Users\\HP\\Desktop\\a.png');
    expect(absoluteLocalPath('C:\\Users\\x\\..\\a.png')).toBe('C:\\Users\\a.png');
    expect(absoluteLocalPath('file:///C:/Users/%E5%9B%BE.png')).toBe('C:\\Users\\图.png');
    expect(absoluteLocalPath('file:///home/u/a.png')).toBe('/home/u/a.png');
    expect(absoluteLocalPath('https://x.com/a.png')).toBeNull();
    expect(absoluteLocalPath('img/a.png')).toBeNull();
  });

  it('反斜杠相对路径与非法百分号编码不抛错', () => {
    const a = el('img', 1, [], { src: '..\\img\\a.png' });
    const b = el('img', 1, [], { src: 'img/100%.png' });
    run(root([el('p', 1, [a, b])]), 'C:\\docs\\sub\\n.md');
    expect(String(a.properties?.['src'])).toContain(encodeURIComponent('C:\\docs\\img\\a.png'));
    expect(String(b.properties?.['src'])).toContain(encodeURIComponent('C:\\docs\\sub\\img\\100%.png'));
  });
});

describe('后处理插件：内嵌 HTML style 过滤', () => {
  it('保留配色/加粗，丢弃 url()/expression/定位', () => {
    expect(filterStyle('color: blue; font-weight: bold')).toBe('color: blue; font-weight: bold');
    expect(filterStyle('background: url(javascript:x); position: fixed; color:#00f')).toBe('color: #00f');
    expect(filterStyle('width: expression(alert(1))')).toBe('');
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
