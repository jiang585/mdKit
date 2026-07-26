/**
 * AI 桥接层（主进程侧）：OpenAI 兼容协议适配器 + 流式转发 + 密钥安全存储。
 * - 渲染进程 CSP 禁止任意外联，AI 请求统一经主进程代理；
 * - 密钥用 safeStorage（操作系统凭据能力）加密后落盘，绝不写日志/普通配置（F7.9）；
 * - 更换后端仅需修改配置（验收标准 9）。
 */
import { app, safeStorage, type WebContents } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AiChatStartReq } from '@shared/ipc-contract';
import { IPC_PUSH } from '@shared/ipc-contract';
import { AI_REQUEST_TIMEOUT_MS } from '@shared/constants';
import { getConfig } from './config-store';
import { log } from './logger';

/* ---------- 密钥存储 ---------- */

function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.json');
}

function readSecrets(): Record<string, string> {
  try {
    if (existsSync(secretsPath())) {
      return JSON.parse(readFileSync(secretsPath(), 'utf-8')) as Record<string, string>;
    }
  } catch (err) {
    log.error('读取密钥文件失败', err);
  }
  return {};
}

function writeSecrets(secrets: Record<string, string>): void {
  const file = secretsPath();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(secrets), 'utf-8');
  renameSync(tmp, file);
}

export function setSecret(profileId: string, apiKey: string): { ok: boolean; message?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: '当前系统不可用安全加密存储，已拒绝保存密钥' };
  }
  const secrets = readSecrets();
  if (apiKey === '') {
    delete secrets[profileId];
  } else {
    secrets[profileId] = safeStorage.encryptString(apiKey).toString('base64');
  }
  writeSecrets(secrets);
  return { ok: true };
}

export function secretStatus(profileId: string): { hasKey: boolean } {
  return { hasKey: Boolean(readSecrets()[profileId]) };
}

function getKey(profileId: string): string | null {
  const enc = readSecrets()[profileId];
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch (err) {
    log.error('密钥解密失败', err);
    return null;
  }
}

/* ---------- OpenAI 兼容流式请求 ---------- */

const inflight = new Map<string, AbortController>();

function endpointOf(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}

export function cancelChat(requestId: string): void {
  inflight.get(requestId)?.abort();
  inflight.delete(requestId);
}

export async function startChat(sender: WebContents, req: AiChatStartReq): Promise<{ ok: boolean; message?: string }> {
  const profile = getConfig().ai.profiles.find((p) => p.id === req.profileId);
  if (!profile) return { ok: false, message: '未找到 AI 配置' };
  const key = getKey(profile.id);
  if (!key) return { ok: false, message: '该配置尚未设置 API 密钥' };

  const controller = new AbortController();
  inflight.set(req.requestId, controller);
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  const emit = (channel: string, payload: unknown): void => {
    if (!sender.isDestroyed()) sender.send(channel, payload);
  };

  void (async () => {
    try {
      const res = await fetch(endpointOf(profile.baseUrl, '/chat/completions'), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: profile.model,
          stream: true,
          messages: req.messages,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        emit(IPC_PUSH.aiError, {
          requestId: req.requestId,
          message: `后端返回 ${res.status}：${text.slice(0, 300) || res.statusText}`,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finishReason: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE：按行解析 data: {...}
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            };
            const choice = parsed.choices?.[0];
            const delta = choice?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              emit(IPC_PUSH.aiChunk, { requestId: req.requestId, delta });
            }
            if (choice?.finish_reason) finishReason = choice.finish_reason;
          } catch {
            // 忽略无法解析的心跳/注释行
          }
        }
      }
      emit(IPC_PUSH.aiDone, { requestId: req.requestId, finishReason });
    } catch (err) {
      const aborted = controller.signal.aborted;
      emit(IPC_PUSH.aiError, {
        requestId: req.requestId,
        message: aborted ? '请求已取消' : `请求失败：${err instanceof Error ? err.message : '网络错误'}`,
      });
      if (!aborted) log.error('AI 请求失败', err);
    } finally {
      clearTimeout(timeout);
      inflight.delete(req.requestId);
    }
  })();

  return { ok: true };
}

export async function testConnection(profileId: string): Promise<{ ok: boolean; message: string }> {
  const profile = getConfig().ai.profiles.find((p) => p.id === profileId);
  if (!profile) return { ok: false, message: '未找到 AI 配置' };
  const key = getKey(profile.id);
  if (!key) return { ok: false, message: '尚未设置 API 密钥' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(endpointOf(profile.baseUrl, '/models'), {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok
      ? { ok: true, message: '连接成功' }
      : { ok: false, message: `连接失败：HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: `连接失败：${err instanceof Error ? err.message : '网络错误'}` };
  }
}
