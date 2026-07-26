/**
 * Mermaid 图表渲染（F3.9，P2 独立插件）：
 * 按需动态加载（不进首屏包，决策输入 §9/§11），失败时降级展示原始代码与错误信息。
 */

type MermaidModule = {
  initialize(config: Record<string, unknown>): void;
  render(id: string, code: string): Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidModule> | null = null;
let initializedDark: boolean | null = null;
let renderSeq = 0;

async function loadMermaid(dark: boolean): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => (m as { default: MermaidModule }).default);
  }
  const mermaid = await mermaidPromise;
  if (initializedDark !== dark) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'inherit',
    });
    initializedDark = dark;
  }
  return mermaid;
}

/**
 * 将容器中 pre > code.language-mermaid 渲染为 SVG。
 * 幂等：源代码存放于 data 属性，主题切换可重渲染。
 */
export async function renderMermaidBlocks(container: HTMLElement, dark: boolean): Promise<void> {
  // 1. 未转换的代码块 → 占位容器
  container.querySelectorAll<HTMLElement>('pre > code.language-mermaid').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const host = document.createElement('div');
    host.className = 'mk-mermaid';
    host.dataset['mermaidSource'] = code.textContent ?? '';
    const lineHost = pre.closest('[data-md-line]') as HTMLElement | null;
    if (lineHost === pre) {
      host.dataset['mdLine'] = pre.dataset['mdLine'] ?? '';
      host.dataset['mdLineEnd'] = pre.dataset['mdLineEnd'] ?? '';
    }
    pre.replaceWith(host);
  });

  const hosts = [...container.querySelectorAll<HTMLElement>('.mk-mermaid')];
  if (hosts.length === 0) return;

  let mermaid: MermaidModule;
  try {
    mermaid = await loadMermaid(dark);
  } catch {
    hosts.forEach((host) => {
      host.innerHTML = `<div class="mk-render-error">Mermaid 模块加载失败</div>`;
    });
    return;
  }

  // 2. 逐块渲染（隔离失败）
  for (const host of hosts) {
    const source = host.dataset['mermaidSource'] ?? '';
    const rendered = host.dataset['mermaidRenderedTheme'];
    const themeKey = dark ? 'dark' : 'light';
    if (rendered === themeKey) continue;
    renderSeq += 1;
    try {
      const { svg } = await mermaid.render(`mk-mermaid-${renderSeq}`, source);
      host.innerHTML = svg;
      host.dataset['mermaidRenderedTheme'] = themeKey;
    } catch (err) {
      const message = err instanceof Error ? err.message.split('\n')[0] : '语法错误';
      const preEl = document.createElement('pre');
      preEl.className = 'mk-mermaid-fallback';
      preEl.textContent = source;
      host.replaceChildren();
      const errorEl = document.createElement('div');
      errorEl.className = 'mk-render-error';
      errorEl.textContent = `Mermaid 渲染失败：${message}`;
      host.append(errorEl, preEl);
      host.dataset['mermaidRenderedTheme'] = themeKey;
      // mermaid 失败时可能遗留孤儿元素
      document.querySelector(`#dmk-mermaid-${renderSeq}`)?.remove();
    }
  }
}
