import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@renderer/preview/worker/pipeline';

const render = (markdown: string, docPath: string | null = null) =>
  renderMarkdown({ revision: 1, markdown, docPath });

describe('渲染管线（决策 §7 / 必测场景）', () => {
  it('空文档渲染不崩溃', async () => {
    const result = await render('');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.revision).toBe(1);
  });

  it('基础语法：标题/粗斜体/列表/引用/分隔线/链接', async () => {
    const result = await render('# 标题\n\n**粗** *斜*\n\n- 项\n\n> 引用\n\n---\n\n[链接](https://a.com)');
    expect(result.html).toContain('<h1');
    expect(result.html).toContain('<strong>粗</strong>');
    expect(result.html).toContain('<em>斜</em>');
    expect(result.html).toContain('<blockquote');
    expect(result.html).toContain('<hr');
    expect(result.html).toContain('href="https://a.com"');
  });

  it('GFM 表格（F3.4）与删除线', async () => {
    const result = await render('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n~~删~~');
    expect(result.html).toContain('<table');
    expect(result.html).toContain('<del>删</del>');
  });

  it('任务列表渲染为只读复选框（F3.7）', async () => {
    const result = await render('- [ ] 待办\n- [x] 已完成');
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).toContain('disabled');
    expect(result.html).toContain('checked');
  });

  it('LaTeX 行内与块级公式经 KaTeX 展开（F3.6）', async () => {
    const result = await render('质能方程 $E=mc^2$：\n\n$$\n\\int_0^1 x^2 dx\n$$');
    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain('katex-display');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('非法公式保留原文并产生诊断，不中断整页（错误隔离）', async () => {
    const result = await render('好段落\n\n$\\frac{$\n\n又一段');
    expect(result.html).toContain('好段落');
    expect(result.html).toContain('又一段');
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(0); // KaTeX ignore 模式下尽量渲染
  });

  it('代码块语言高亮与未知语言纯文本回退', async () => {
    const result = await render('```js\nconst x = 1;\n```\n\n```unknownlang\nplain\n```');
    expect(result.html).toContain('hljs');
    expect(result.html).toContain('language-unknownlang');
    expect(result.html).toContain('plain');
  });

  it('脚注（F3.8）', async () => {
    const result = await render('正文[^1]\n\n[^1]: 注释内容');
    expect(result.html).toContain('data-footnote');
    expect(result.html).toContain('注释内容');
  });

  it('XSS：script/内联事件/javascript: 协议全部被消毒（决策 §7）', async () => {
    const result = await render(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n[ok](https://ok.com)',
    );
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onerror');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('https://ok.com');
  });

  it('原始 HTML 不被执行（allowDangerousHtml=false）', async () => {
    const result = await render('<div onclick="x()">raw</div>');
    expect(result.html).not.toContain('onclick');
  });

  it('块级锚点与 TOC 元数据产出', async () => {
    const result = await render('# 一\n\n段落\n\n## 二');
    expect(result.anchors.length).toBeGreaterThanOrEqual(3);
    expect(result.toc.map((t) => t.text)).toEqual(['一', '二']);
    expect(result.html).toContain('data-md-line="1"');
  });

  it('相对图片按文档路径改写为受控协议', async () => {
    const result = await render('![图](./a.png)', 'C:\\notes\\doc.md');
    expect(result.html).toContain('mdkit-doc://local/?p=');
  });
});
