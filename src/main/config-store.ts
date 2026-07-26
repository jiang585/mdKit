/**
 * 用户配置存储：userData/config.json（原子写入），Zod 校验，损坏时回退默认并备份。
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  defaultUserConfig,
  mergeConfig,
  userConfigSchema,
  type UserConfig,
  type UserConfigPatch,
} from '@shared/config-schema';
import { RECENT_FILES_MAX } from '@shared/constants';
import { log } from './logger';

let cached: UserConfig | null = null;

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function atomicWrite(file: string, data: string): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, file);
}

export function getConfig(): UserConfig {
  if (cached) return cached;
  const file = configPath();
  if (existsSync(file)) {
    try {
      cached = userConfigSchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
      return cached;
    } catch (err) {
      log.error('配置文件损坏，回退默认配置', err);
      try {
        renameSync(file, `${file}.bak`);
      } catch {
        /* 忽略备份失败 */
      }
    }
  }
  cached = defaultUserConfig();
  return cached;
}

export function patchConfig(patch: UserConfigPatch): UserConfig {
  const next = mergeConfig(getConfig(), patch);
  cached = next;
  atomicWrite(configPath(), JSON.stringify(next, null, 2));
  return next;
}

export function touchRecentFile(path: string, name: string): UserConfig {
  const cfg = getConfig();
  const rest = cfg.recentFiles.filter((f) => f.path !== path);
  const recentFiles = [{ path, name, lastOpenedAt: Date.now() }, ...rest].slice(0, RECENT_FILES_MAX);
  return patchConfig({ recentFiles });
}

export function clearRecentFiles(): UserConfig {
  return patchConfig({ recentFiles: [] });
}
