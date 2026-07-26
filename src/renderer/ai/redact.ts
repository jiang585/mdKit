/**
 * 脱敏模式（F7.9）：发送前摘除常见敏感元数据。
 * 覆盖：邮箱、密钥形态字符串、绝对路径（Win/POSIX）、IPv4、URL 中的 userinfo。
 */

const RULES: Array<{ name: string; re: RegExp; replace: string }> = [
  { name: 'apiKey', re: /\b(?:sk|pk|rk|key|token)-[A-Za-z0-9_-]{12,}\b/g, replace: '[已脱敏:密钥]' },
  { name: 'bearer', re: /Bearer\s+[A-Za-z0-9._-]{12,}/g, replace: 'Bearer [已脱敏]' },
  { name: 'email', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, replace: '[已脱敏:邮箱]' },
  { name: 'winPath', re: /\b[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\)*[^\s\\/:*?"<>|]*/g, replace: '[已脱敏:路径]' },
  { name: 'posixPath', re: /(?<![\w:.])\/(?:home|Users|var|etc|opt)\/[^\s'"）)]+/g, replace: '[已脱敏:路径]' },
  { name: 'ipv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/g, replace: '[已脱敏:IP]' },
];

export interface RedactResult {
  text: string;
  hits: number;
}

export function redactText(input: string): RedactResult {
  let text = input;
  let hits = 0;
  for (const rule of RULES) {
    text = text.replace(rule.re, () => {
      hits += 1;
      return rule.replace;
    });
  }
  return { text, hits };
}
