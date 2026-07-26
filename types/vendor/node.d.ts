/** Node.js 最小声明（沙盒类型检查用） */

declare var process: {
  argv: string[];
  env: Record<string, string | undefined>;
  platform: string;
  exit(code?: number): never;
};

declare class Buffer extends Uint8Array {
  static from(data: string, encoding?: string): Buffer;
  static concat(list: Uint8Array[]): Buffer;
  toString(encoding?: string): string;
}

declare function setTimeout(handler: (...args: unknown[]) => void, ms?: number): NodeTimer;
declare function clearTimeout(timer: NodeTimer | undefined | null): void;
declare function setInterval(handler: (...args: unknown[]) => void, ms?: number): NodeTimer;
declare function clearInterval(timer: NodeTimer | undefined | null): void;
interface NodeTimer {
  ref(): NodeTimer;
  unref(): NodeTimer;
}

declare var console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

declare var __dirname: string;

declare function fetch(url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  text(): Promise<string>;
}>;

declare class AbortController {
  signal: AbortSignal;
  abort(): void;
}
interface AbortSignal {
  aborted: boolean;
}

declare class TextDecoder {
  constructor(encoding?: string);
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

declare class URL {
  constructor(url: string, base?: string);
  protocol: string;
  searchParams: { get(name: string): string | null };
  toString(): string;
}

declare class Response {
  constructor(body?: string, init?: { status?: number });
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

declare class File {
  name: string;
  text(): Promise<string>;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function extname(p: string): string;
  export function resolve(...parts: string[]): string;
  export function normalize(p: string): string;
  export function isAbsolute(p: string): boolean;
  export const sep: string;
}

declare module 'node:fs' {
  export function existsSync(p: string): boolean;
  export function mkdirSync(p: string, opts?: { recursive?: boolean }): void;
  export function readFileSync(p: string, encoding: string): string;
  export function writeFileSync(p: string, data: string, encoding?: string): void;
  export function appendFileSync(p: string, data: string, encoding?: string): void;
  export function renameSync(from: string, to: string): void;
  export function rmSync(p: string, opts?: { force?: boolean; recursive?: boolean }): void;
  export function readdirSync(p: string): string[];
  export function statSync(p: string): { size: number; mtimeMs: number };
}

declare module 'node:fs/promises' {
  export function readFile(p: string, encoding: string): Promise<string>;
  export function writeFile(p: string, data: string | Uint8Array, encoding?: string): Promise<void>;
  export function rm(p: string, opts?: { force?: boolean }): Promise<void>;
}

declare module 'node:url' {
  export function pathToFileURL(p: string): { toString(): string };
}
