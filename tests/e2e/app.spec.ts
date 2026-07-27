/**
 * E2E（Playwright + Electron）：打开 → 编辑 → 预览 → 主题切换 → 保存 核心用户流程。
 * 运行前需 `npm run build`（加载 out/main/index.js）。断网状态下同样应全部通过（离线验收 5）。
 */
import { _electron, expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
let app: any;
let page: any;
let userDataDir: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'mdkit-e2e-user-'));
  const executablePath = process.env['MDKIT_E2E_EXECUTABLE'];
  const args = executablePath
    ? [`--user-data-dir=${userDataDir}`]
    : ['out/main/index.js', `--user-data-dir=${userDataDir}`];
  app = await _electron.launch({ executablePath, args });
  page = await app.firstWindow();
  page.on('console', (message: any) => {
    if (message.type() === 'error') console.error(`[renderer] ${message.text()}`);
  });
  page.on('pageerror', (error: Error) => console.error(`[renderer] ${error.message}`));
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('启动显示欢迎页，新建标签进入编辑器', async () => {
  await page.waitForSelector('[data-testid="welcome"]');
  const bridgeKeys = await page.evaluate(() => Object.keys(window.mdkit ?? {}));
  expect(bridgeKeys).toEqual(
    expect.arrayContaining(['file', 'config', 'theme', 'exporter', 'window', 'drafts', 'events']),
  );
  await page.click('text=新建文档');
  await page.waitForSelector('.cm-editor');
});

test('输入 Markdown 后预览在 300ms 级延迟内更新（F3.1）', async () => {
  await page.click('.cm-content');
  await page.keyboard.type('# 你好世界\n\n**加粗** 与 $E=mc^2$');
  await page.waitForSelector('[data-testid="preview-content"] h1', { timeout: 2000 });
  const h1 = await page.textContent('[data-testid="preview-content"] h1');
  expect(h1).toContain('你好世界');
  await page.waitForSelector('[data-testid="preview-content"] .katex');
});

test('主题一键切换且编辑内容不丢失（必测场景）', async () => {
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--mk-editor-bg'),
  );
  await page.evaluate(() => {
    document.documentElement.dataset.probe = '1';
  });
  // 经菜单命令通道触发主题切换（与快捷键同路径）
  await app.evaluate(({ BrowserWindow }: any) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'theme.next' });
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--mk-editor-bg'),
  );
  expect(after).not.toBe(before);
  const text = await page.textContent('.cm-content');
  expect(text).toContain('你好世界');
});

test('编辑中部后预览滚动位置保持（验收 3）', async () => {
  const longDoc = Array.from({ length: 120 }, (_, i) => `## 段落 ${i}\n\n内容 ${i}`).join('\n\n');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(longDoc);
  await page.waitForSelector('[data-testid="preview-content"] h2');
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 180; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  const before = await page.evaluate(
    () => (document.querySelector('[data-testid="preview-scroll"]') as HTMLElement).scrollTop,
  );
  await page.keyboard.type(' 中部追加');
  await page.waitForTimeout(600);
  const after = await page.evaluate(
    () => (document.querySelector('[data-testid="preview-scroll"]') as HTMLElement).scrollTop,
  );
  expect(Math.abs(after - before)).toBeLessThan(80);
});

test('滚动编辑区时预览区跟随源码位置（F3.2）', async () => {
  const before = await page.evaluate(
    () => (document.querySelector('[data-testid="preview-scroll"]') as HTMLElement).scrollTop,
  );
  await page.evaluate(() => {
    const editor = document.querySelector('.cm-scroller') as HTMLElement;
    editor.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
    editor.scrollTop = (editor.scrollHeight - editor.clientHeight) * 0.75;
    editor.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(
    (previous: number) =>
      (document.querySelector('[data-testid="preview-scroll"]') as HTMLElement).scrollTop > previous + 200,
    before,
  );
  const ratios = await page.evaluate(() => {
    const editor = document.querySelector('.cm-scroller') as HTMLElement;
    const preview = document.querySelector('[data-testid="preview-scroll"]') as HTMLElement;
    return {
      editor: editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight),
      preview: preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight),
    };
  });
  expect(Math.abs(ratios.editor - ratios.preview)).toBeLessThan(0.25);
});

test('保存到磁盘（对话框经临时文件旁路验证主链路）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdkit-e2e-'));
  const file = join(dir, 'saved.md');
  writeFileSync(file, '# 占位', 'utf-8');
  // 经 preload 的拖拽入口授权并读取，再模拟主进程的打开文件推送。
  const opened = await page.evaluate(async (filePath: string) => {
    if (!window.mdkit) throw new Error('preload bridge missing');
    return window.mdkit.file.openDropped(filePath);
  }, file);
  await app.evaluate(({ BrowserWindow }: any, file: { path: string; name: string; content: string }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('app:open-path', file);
  }, opened);
  await expect(page.locator('.cm-content')).toContainText('占位');
  await page.click('.cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\n新增内容');
  await app.evaluate(({ BrowserWindow }: any) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'file.save' });
  });
  await page.waitForTimeout(600);
  const saved = readFileSync(file, 'utf-8');
  expect(saved).toContain('新增内容');
});
