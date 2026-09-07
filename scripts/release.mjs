#!/usr/bin/env node
/**
 * 发布打包：收集 tauri build 产物 → release/<version>/
 *  - MD工具箱-Setup-<version>.exe（NSIS 安装包）
 *  - MD工具箱-Portable-<version>.zip（便携版：exe + 运行所需 DLL）
 *  - MD工具箱-<version>.exe（裸 exe 独立执行版）
 * 用法：npm run build 之后执行 node scripts/release.mjs
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
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
const exeName = 'md-toolbox.exe';

if (!existsSync(join(targetDir, exeName))) {
  console.error(`未找到主程序 ${exeName}，请先 npm run build`);
  process.exit(1);
}

/* ---------- 1. NSIS 安装包 ---------- */
const nsisDir = join(bundleDir, 'nsis');
if (existsSync(nsisDir)) {
  for (const name of readdirSync(nsisDir)) {
    if (name.endsWith('.exe')) {
      const dest = `MD工具箱-Setup-${version}.exe`;
      const destEn = `MD-Toolbox-Setup-${version}.exe`;
      copyFileSync(join(nsisDir, name), join(outDir, dest));
      copyFileSync(join(nsisDir, name), join(outDir, destEn));
      console.log(`安装版：${dest} / ${destEn} (${(statSync(join(nsisDir, name)).size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
} else {
  console.warn('警告：未找到 NSIS 目录');
}

/* ---------- 2. 便携版 zip（exe + 随附 DLL） ---------- */
const portableFiles = [join(targetDir, exeName)];
for (const dll of ['WebView2Loader.dll']) {
  const p = join(targetDir, dll);
  if (existsSync(p)) portableFiles.push(p);
}
const zipName = `MD工具箱-Portable-${version}.zip`;
const zipNameEn = `MD-Toolbox-Portable-${version}.zip`;
const zipPath = join(outDir, zipName);
const zipPathEn = join(outDir, zipNameEn);
if (existsSync(zipPath)) await rm(zipPath);
if (existsSync(zipPathEn)) await rm(zipPathEn);
const stageDir = await mkdtemp(join(tmpdir(), 'mdkit-portable-'));
for (const f of portableFiles) {
  copyFileSync(f, join(stageDir, f === portableFiles[0] ? 'MD工具箱.exe' : f.split(/[\\/]/).pop()));
}
const result = spawnSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force`,
], { stdio: 'inherit' });
await rm(stageDir, { recursive: true, force: true });
if (result.status !== 0) {
  console.error('便携版打包失败');
  process.exit(1);
}
copyFileSync(zipPath, zipPathEn);
console.log(`便携版：${zipName} / ${zipNameEn} (${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);

/* ---------- 3. 裸 exe 版（单文件可执行程序） ---------- */
const bareExeName = `MD工具箱-${version}.exe`;
const bareExeNameEn = `MD-Toolbox-${version}.exe`;
const bareExePath = join(outDir, bareExeName);
const bareExePathEn = join(outDir, bareExeNameEn);
copyFileSync(join(targetDir, exeName), bareExePath);
copyFileSync(join(targetDir, exeName), bareExePathEn);
console.log(`裸exe版：${bareExeName} / ${bareExeNameEn} (${(statSync(bareExePath).size / 1024 / 1024).toFixed(1)} MB)`);

// 同时放一个不带版本号的别名方便用户快捷双击
const aliasBareExe = join(outDir, 'MD工具箱.exe');
copyFileSync(join(targetDir, exeName), aliasBareExe);
console.log(`裸exe别名：MD工具箱.exe (${(statSync(aliasBareExe).size / 1024 / 1024).toFixed(1)} MB)`);

console.log(`\n🎉 发布打包完成，产物位于：${outDir}`);
