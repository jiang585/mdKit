#!/usr/bin/env node
/**
 * 无头诊断：用系统 Edge 无头模式复现渲染 Worker 链路（不弹窗、不控制桌面）。
 * - 路径A：主线程直接 import pipeline 渲染
 * - 路径B：完全复刻应用的 new Worker(URL, {type:'module'}) 链路
 * 用法：node scripts/probe-preview.mjs （需先启动 npm run vite:dev）
 */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5173';
const SAMPLE = '# 标题\n\n正文 **加粗** 与 `code`。\n\n$$E=mc^2$$\n\n```js\nconsole.log(1)\n```\n';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// 路径A：主线程直接渲染
const direct = await page.evaluate(async (md) => {
  try {
    const mod = await import('/src/renderer/preview/worker/pipeline.ts');
    const res = await mod.renderMarkdown({ revision: 1, markdown: md, docPath: null });
    return { ok: true, htmlLen: res.html.length, head: res.html.slice(0, 80) };
  } catch (err) {
    return { ok: false, error: `${err.message}\n${err.stack ?? ''}` };
  }
}, SAMPLE);
console.log('== 路径A：主线程 pipeline ==');
console.log(JSON.stringify(direct, null, 2));

// 路径B：复刻 Worker 链路
const workerResult = await page.evaluate(async (md) => {
  const out = { ok: false, result: null, error: null, workerErrors: [] };
  await new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker('/src/renderer/preview/worker/render.worker.ts', { type: 'module' });
    } catch (err) {
      out.error = `构造失败: ${err.message}`;
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      out.error = out.error ?? '超时（8s 无响应）';
      worker.terminate();
      resolve();
    }, 8000);
    worker.onmessage = (e) => {
      if (e.data?.type === 'result') {
        out.ok = true;
        out.result = { htmlLen: e.data.res.html.length, head: e.data.res.html.slice(0, 80) };
        clearTimeout(timer);
        worker.terminate();
        resolve();
      } else if (e.data?.type === 'worker-error') {
        out.error = e.data.message;
        clearTimeout(timer);
        worker.terminate();
        resolve();
      }
    };
    worker.onerror = (e) => {
      out.workerErrors.push(e.message || 'worker onerror(无 message)');
    };
    worker.postMessage({ type: 'render', req: { revision: 1, markdown: md, docPath: null } });
  });
  return out;
}, SAMPLE);
console.log('== 路径B：Worker 链路 ==');
console.log(JSON.stringify(workerResult, null, 2));

console.log('== 页面日志（最后 25 条）==');
for (const line of logs.slice(-25)) console.log(line);

await browser.close();
