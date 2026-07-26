/**
 * 文件日志：userData/logs/mdkit.log，1MB 轮转一份。
 * 红线（架构决策输入 §4）：不记录 API 密钥、文档正文、完整用户文件路径。
 */
import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const MAX_LOG_BYTES = 1024 * 1024;
let logDir: string | null = null;

function logFile(): string {
  if (!logDir) {
    logDir = join(app.getPath('userData'), 'logs');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  }
  return join(logDir, 'mdkit.log');
}

/** 将潜在敏感串脱敏：密钥形态、绝对路径只留文件名 */
export function redactForLog(input: string): string {
  return input
    .replace(/(sk-|key-|Bearer\s+)[A-Za-z0-9_-]{8,}/g, '$1***')
    .replace(/(?:[A-Za-z]:\\|\/)[^\s'"]{4,}/g, (m) => `…${basename(m)}`);
}

function write(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  try {
    const file = logFile();
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) {
      renameSync(file, `${file}.1`);
    }
    appendFileSync(file, `${new Date().toISOString()} [${level}] ${redactForLog(msg)}\n`, 'utf-8');
  } catch {
    // 日志失败不影响主流程
  }
}

export const log = {
  info: (msg: string): void => write('INFO', msg),
  warn: (msg: string): void => write('WARN', msg),
  error: (msg: string, err?: unknown): void =>
    write('ERROR', err instanceof Error ? `${msg}: ${err.message}` : msg),
};
