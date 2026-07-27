/**
 * 预览视图：接收渲染结果（纯数据），提交 DOM 并保持滚动阅读位置。
 * 交互：链接外开/锚点内跳、图片点击放大、任务列表只读、Mermaid 惰性渲染、光标同步高亮。
 */
import { memo, useCallback, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import type { RenderResult } from '@renderer/shared/render-types';
import { captureAnchor, readBlockRects, restoreScrollTop } from './scroll-keeper';
import { renderMermaidBlocks } from './mermaid-lazy';
import { findAnchorLineForCursor } from './cursor-sync';

export interface PreviewControls {
  /** 滚动到源码行对应的块（TOC 导航用） */
  scrollToLine(line: number, options?: { behavior?: ScrollBehavior; flash?: boolean }): void;
}

export interface PreviewPanelProps {
  result: RenderResult | null;
  dark: boolean;
  /** 编辑区光标行（启用光标同步时高亮对应块） */
  cursorLine: number | null;
  syncCursor: boolean;
  onOpenExternal: (url: string) => void;
  onImageClick: (src: string, alt: string) => void;
  onAnchorChanged: (line: number, type: 'heading' | 'block') => void;
  onReady?: (controls: PreviewControls) => void;
  className?: string;
}

export const PreviewPanel = memo(function PreviewPanel(props: PreviewPanelProps) {
  const { result, dark, cursorLine, syncCursor, onOpenExternal, onImageClick, onAnchorChanged, onReady } =
    props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const anchorsRef = useRef<RenderResult['anchors']>([]);
  const scrollRafRef = useRef(0);

  /* ---------- 提交渲染结果（同步测量避免闪跳，U1/U2） ---------- */
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content || !result) return;
    anchorsRef.current = result.anchors;

    const anchor = captureAnchor(
      scroller.scrollTop,
      scroller.clientHeight,
      scroller.scrollHeight,
      readBlockRects(content),
    );
    content.innerHTML = result.html;
    // 同步读取新布局并恢复位置（在本帧绘制前完成，无可见跳动）
    const next = restoreScrollTop(
      anchor,
      scroller.clientHeight,
      scroller.scrollHeight,
      readBlockRects(content),
    );
    scroller.scrollTop = next;

    void renderMermaidBlocks(content, dark);
  }, [result, dark]);

  /* ---------- 光标同步（F3.12） ---------- */
  useEffect(() => {
    const content = contentRef.current;
    if (!content || !syncCursor || cursorLine === null) return;
    const line = findAnchorLineForCursor(anchorsRef.current, cursorLine);
    content.querySelectorAll('.mk-cursor-sync').forEach((el) => el.classList.remove('mk-cursor-sync'));
    if (line === null) return;
    const el = content.querySelector<HTMLElement>(`[data-md-line="${line}"]`);
    if (el) {
      el.classList.add('mk-cursor-sync');
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [cursorLine, syncCursor, result]);

  /* ---------- 控制句柄（TOC 导航） ---------- */
  const controls = useMemo<PreviewControls>(
    () => ({
      scrollToLine(line: number, options = {}) {
        const content = contentRef.current;
        if (!content) return;
        let best: HTMLElement | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        content.querySelectorAll<HTMLElement>('[data-md-line]').forEach((el) => {
          const l = Number(el.dataset['mdLine']);
          const dist = Math.abs(l - line);
          if (Number.isFinite(l) && dist < bestDist) {
            best = el;
            bestDist = dist;
          }
        });
        if (best !== null) {
          (best as HTMLElement).scrollIntoView({ behavior: options.behavior ?? 'smooth', block: 'start' });
          if (options.flash ?? true) {
            (best as HTMLElement).classList.add('mk-flash');
            setTimeout(() => (best as HTMLElement).classList.remove('mk-flash'), 900);
          }
        }
      },
    }),
    [],
  );
  useEffect(() => {
    onReady?.(controls);
  }, [controls, onReady]);

  /* ---------- 事件代理 ---------- */
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;

      const link = target.closest('a[href]');
      if (link) {
        event.preventDefault();
        const href = link.getAttribute('href') ?? '';
        if (href.startsWith('#')) {
          const el = contentRef.current?.querySelector(
            `#${CSS.escape(decodeURIComponent(href.slice(1)))}`,
          );
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          onOpenExternal(href);
        }
        return;
      }

      if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        // 任务列表预览态只读（F3.7）
        event.preventDefault();
        return;
      }

      if (target instanceof HTMLImageElement && target.src) {
        onImageClick(target.src, target.alt);
      }
    },
    [onOpenExternal, onImageClick],
  );

  /* ---------- 滚动 → 阅读锚点事实通知（rAF 节流） ---------- */
  const handleScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const scroller = scrollRef.current;
      const content = contentRef.current;
      if (!scroller || !content) return;
      const state = captureAnchor(
        scroller.scrollTop,
        scroller.clientHeight,
        scroller.scrollHeight,
        readBlockRects(content),
      );
      if (state.line >= 0) {
        const anchorMeta = anchorsRef.current.find((a) => a.line === state.line);
        onAnchorChanged(state.line, anchorMeta && /^h[1-6]$/.test(anchorMeta.tag) ? 'heading' : 'block');
      }
    });
  }, [onAnchorChanged]);

  useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), []);

  return (
    <div
      ref={scrollRef}
      className={`mk-preview-scroll ${props.className ?? ''}`}
      onScroll={handleScroll}
      data-testid="preview-scroll"
    >
      <div
        ref={contentRef}
        className="mk-preview-content markdown-body"
        onClick={handleClick}
        data-testid="preview-content"
      />
    </div>
  );
});
