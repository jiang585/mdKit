/**
 * 崩溃恢复草稿（可用性 §3.3：自动保存防丢失，崩溃恢复提示）。
 * 草稿以 tabId 为键写入 userData/drafts/，正常关闭或保存成功后清除。
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DraftEntry } from '@shared/ipc-contract';
import { log } from './logger';

function draftsDir(): string {
  const dir = join(app.getPath('userData'), 'drafts');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function saveDraft(tabId: string, path: string | null, content: string): void {
  if (!SAFE_ID.test(tabId)) return;
  const entry: DraftEntry = { tabId, path, content, savedAt: Date.now() };
  writeFileSync(join(draftsDir(), `${tabId}.json`), JSON.stringify(entry), 'utf-8');
}

export function clearDraft(tabId: string): void {
  if (!SAFE_ID.test(tabId)) return;
  rmSync(join(draftsDir(), `${tabId}.json`), { force: true });
}

export function listDrafts(): DraftEntry[] {
  try {
    return readdirSync(draftsDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(draftsDir(), f), 'utf-8')) as DraftEntry)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch (err) {
    log.error('读取草稿失败', err);
    return [];
  }
}
