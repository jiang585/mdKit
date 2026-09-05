/**
 * 上下文构建（F7.2）：携带当前文档内容与光标位置；超长文档按光标窗口截取。
 */
import type { AiMessage } from '@shared/ipc-contract';
import { redactText } from './redact';

const FULL_DOC_LIMIT = 24000;
const WINDOW_RADIUS = 8000;
export const CURSOR_MARK = '⟨光标⟩';

export interface DocContext {
  docText: string;
  cursorOffset: number;
  selectionText: string;
  fileName: string;
}

function docSlice(docText: string, cursorOffset: number): { body: string; truncated: boolean } {
  if (docText.length <= FULL_DOC_LIMIT) {
    return {
      body: docText.slice(0, cursorOffset) + CURSOR_MARK + docText.slice(cursorOffset),
      truncated: false,
    };
  }
  const start = Math.max(0, cursorOffset - WINDOW_RADIUS);
  const end = Math.min(docText.length, cursorOffset + WINDOW_RADIUS);
  const head = start > 0 ? '…（前文省略）\n' : '';
  const tail = end < docText.length ? '\n…（后文省略）' : '';
  return {
    body:
      head +
      docText.slice(start, cursorOffset) +
      CURSOR_MARK +
      docText.slice(cursorOffset, end) +
      tail,
    truncated: true,
  };
}

export function buildChatMessages(
  history: AiMessage[],
  userInput: string,
  context: DocContext | null,
  redact: boolean,
): { messages: AiMessage[]; redactedHits: number } {
  let redactedHits = 0;
  const messages: AiMessage[] = [
    {
      role: 'system',
      content:
        '你是 MD工具箱内置的 Markdown 写作助手。回答使用中文，格式使用 Markdown。' +
        (context ? `当前打开的文档《${context.fileName}》内容附后，${CURSOR_MARK} 为光标位置。` : ''),
    },
  ];
  if (context) {
    let { body } = docSlice(context.docText, context.cursorOffset);
    if (redact) {
      const r = redactText(body);
      body = r.text;
      redactedHits += r.hits;
    }
    messages.push({ role: 'system', content: `【文档上下文】\n${body}` });
    if (context.selectionText) {
      let sel = context.selectionText;
      if (redact) {
        const r = redactText(sel);
        sel = r.text;
        redactedHits += r.hits;
      }
      messages.push({ role: 'system', content: `【用户当前选中文本】\n${sel}` });
    }
  }
  messages.push(...history, { role: 'user', content: userInput });
  return { messages, redactedHits };
}

/** 文档生成/修改指令（F7.3/F7.4）：要求模型输出完整结果文档 */
export function buildDocEditMessages(
  instruction: string,
  docText: string,
  redact: boolean,
): { messages: AiMessage[]; redactedHits: number } {
  let body = docText;
  let redactedHits = 0;
  if (redact) {
    const r = redactText(body);
    body = r.text;
    redactedHits = r.hits;
  }
  return {
    redactedHits,
    messages: [
      {
        role: 'system',
        content:
          '你是 Markdown 文档编辑器。用户会给出当前文档与修改指令。' +
          '你必须输出修改后的完整文档正文：保留未涉及部分原样，不要添加任何解释、前言或结语，' +
          '不要用 ``` 代码围栏包裹整篇输出。',
      },
      { role: 'user', content: `【当前文档】\n${body}\n\n【修改指令】\n${instruction}` },
    ],
  };
}

/** 行内辅助（F7.5）：针对选中文本生成替换内容 */
export function buildInlineMessages(
  instruction: string,
  selectionText: string,
  redact: boolean,
): { messages: AiMessage[]; redactedHits: number } {
  let sel = selectionText;
  let redactedHits = 0;
  if (redact) {
    const r = redactText(sel);
    sel = r.text;
    redactedHits = r.hits;
  }
  return {
    redactedHits,
    messages: [
      {
        role: 'system',
        content:
          '你是行内写作辅助。仅输出处理后的文本本身：不要解释，不要引号或代码围栏包裹。' +
          '若指令为翻译/润色/改写，输出与原文对应的结果；保持 Markdown 语法合法。',
      },
      {
        role: 'user',
        content: sel ? `【选中文本】\n${sel}\n\n【指令】\n${instruction}` : `【指令】\n${instruction}`,
      },
    ],
  };
}

/** 剥掉模型偶发的整篇代码围栏包裹 */
export function stripOuterFence(text: string): string {
  const m = text.trim().match(/^```(?:markdown|md)?\n([\s\S]*?)\n?```$/);
  return m ? m[1] : text;
}
