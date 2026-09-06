#!/usr/bin/env node
/**
 * 发布打包：收集 tauri build 产物 → release/<version>/
 *  - MD工具箱-Setup-<version>.exe（NSIS 安装包）
 *  - MD工具箱-Portable-<version>.zip（便携版：exe + 运行所需 DLL）
 * 用法：npm run build 之后执行 node scripts/release.mjs
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const outDir = join(root, 'release', version);
mkdirSync(outDir, { recursive: true });

const targetDir = join(root, 'src-tauri', 'target', 'release');
const bundleDir = join(targetDir, 'bundle');

/* ---------- NSIS 安装包 ---------- */
const nsisDir = join(bundleDir, 'nsis');
if (!existsSync(nsisDir)) {
  console.error('未找到 NSIS 产物，请先执行 npm run build');
  process.exit(1);
}
for (const name of readdirSync(nsisDir)) {
  if (name.endsWith('.exe')) {
    const dest = `MD工具箱-Setup-${version}.exe`;
    copyFileSync(join(nsisDir, name), join(outDir, dest));
    console.log(`安装包：${dest} (${(statSync(join(nsisDir, name)).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

/* ---------- 便携版 zip（exe + 随附 DLL） ---------- */
// 主程序名与 tauri.conf.json 的 mainBinaryName 一致（target 目录可能有其他 bin，不能靠 find）
const exeName = 'md-toolbox.exe';
if (!existsSync(join(targetDir, exeName))) {
  console.error(`未找到主程序 ${exeName}，请先 npm run build`);
  process.exit(1);
}
const portableFiles = [join(targetDir, exeName)];
for (const dll of ['WebView2Loader.dll']) {
  const p = join(targetDir, dll);
  if (existsSync(p)) portableFiles.push(p);
}
const zipName = `MD工具箱-Portable-${version}.zip`;
const zipPath = join(outDir, zipName);
if (existsSync(zipPath)) await rm(zipPath);
const stageDir = await mkdtemp(join(tmpdir(), 'mdkit-portable-'));
for (const f of portableFiles) copyFileSync(f, join(stageDir, f === portableFiles[0] ? 'MD工具箱.exe' : f.split(/[\\/]/).pop()));
const result = spawnSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force`,
], { stdio: 'inherit' });
await rm(stageDir, { recursive: true, force: true });
if (result.status !== 0) {
  console.error('便携版打包失败');
  process.exit(1);
}
console.log(`便携版：${zipName} (${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`\n产物目录：${outDir}`);
