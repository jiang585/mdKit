/**
 * Node 模块解析钩子：让纯逻辑单测可在无 node_modules 环境直接运行
 * （node --experimental-strip-types + 本钩子）。
 *  - '@renderer/*' → src/renderer/*，'@shared/*' → src/shared/*
 *  - 相对/别名导入自动补 .ts
 *  - 'vitest' → 本地垫片（tests/sandbox/vitest-shim.ts）
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..');

function withTsExtension(absPath) {
  if (existsSync(absPath)) return absPath;
  if (existsSync(`${absPath}.ts`)) return `${absPath}.ts`;
  return absPath;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vitest') {
    return {
      shortCircuit: true,
      url: pathToFileURL(resolvePath(projectRoot, 'tests/sandbox/vitest-shim.ts')).href,
    };
  }
  if (specifier.startsWith('@renderer/') || specifier.startsWith('@shared/')) {
    const mapped = specifier
      .replace(/^@renderer\//, 'src/renderer/')
      .replace(/^@shared\//, 'src/shared/');
    return {
      shortCircuit: true,
      url: pathToFileURL(withTsExtension(resolvePath(projectRoot, mapped))).href,
    };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = dirname(fileURLToPath(context.parentURL));
    const abs = resolvePath(base, specifier);
    if (!existsSync(abs) && existsSync(`${abs}.ts`)) {
      return { shortCircuit: true, url: pathToFileURL(`${abs}.ts`).href };
    }
  }
  return nextResolve(specifier, context);
}
