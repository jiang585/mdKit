/**
 * 沙盒测试运行器：node --experimental-strip-types --import tests/sandbox/register.mjs tests/sandbox/run-all.ts
 * 仅纳入零第三方依赖的纯逻辑测试；依赖真实库的测试（管线/Ajv/Zod/组件/E2E）在
 * 安装依赖后经 `npm test` / `npm run e2e` 执行。
 */
import '../unit/shared/debounce.test.ts';
import '../unit/shared/event-bus.test.ts';
import '../unit/shared/text-utils.test.ts';
import '../unit/preview/scroll-keeper.test.ts';
import '../unit/preview/scheduler.test.ts';
import '../unit/preview/cursor-sync.test.ts';
import '../unit/preview/post-process.test.ts';
import '../unit/editor/markdown-commands.test.ts';
import '../unit/ai/diff.test.ts';
import '../unit/ai/redact.test.ts';
import '../unit/ai/prompt-context.test.ts';
import '../unit/theme/theme-apply.test.ts';
import { __run } from 'vitest';

const { passed, failed } = await __run();
console.log(`\n沙盒纯逻辑测试：通过 ${passed}，失败 ${failed}`);
if (failed > 0) process.exit(1);
