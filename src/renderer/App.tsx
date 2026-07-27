/**
 * 组合根：装配文件/编辑/渲染/主题/布局/导出/AI 各模块（仅经各模块入口 API 通信 —— C1/C4）。
 * 数据流保持单向：文件 → 文档状态 → 编辑核心 → 渲染调度 → Worker → 预览视图（C2）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserConfig } from '@shared/config-schema';
import type { DraftEntry, MenuCommand, OpenedFile, RecentFile } from '@shared/ipc-contract';
import type { ThemeSummary } from '@shared/theme-types';
import type { RenderResult } from '@renderer/shared/render-types';
import { bridge, isElectron } from '@renderer/shared/bridge';
import { appBus } from '@renderer/shared/event-bus';
import { countWords, fileNameOf } from '@renderer/shared/text-utils';
import { debounce } from '@renderer/shared/debounce';
import { EditorPanel } from '@renderer/editor/EditorPanel';
import type { EditorHandle } from '@renderer/editor/index';
import { createRenderScheduler, PreviewPanel, type PreviewControls, type RenderScheduler } from '@renderer/preview/index';
import { createThemeEngine } from '@renderer/theme/index';
import { SplitPane, useLayoutStore } from '@renderer/layout/index';
import { exportAsHtml, exportAsPdf } from '@renderer/export/index';
import { ChatPanel, InlineAssist, useAiStore } from '@renderer/ai/index';
import { tabStateStore, useDocumentStore } from '@renderer/document/document-store';
import { createAutosave } from '@renderer/document/autosave';
import { TabBar } from '@renderer/components/TabBar';
import { StatusBar } from '@renderer/components/StatusBar';
import { ToastHost } from '@renderer/components/Toast';
import { WelcomeView } from '@renderer/components/WelcomeView';
import { TocPanel } from '@renderer/components/TocPanel';
import { ImageLightbox } from '@renderer/components/ImageLightbox';
import { Modal } from '@renderer/components/Modal';
import { SettingsDialog } from '@renderer/components/SettingsDialog';
import { toast, useUiStore } from '@renderer/components/ui-store';

const themeEngine = createThemeEngine();

export function App() {
  /* ---------- 低频应用状态 ---------- */
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'general' | 'theme' | 'shortcuts' | 'ai'>('general');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<DraftEntry[] | null>(null);
  const [confirmClose, setConfirmClose] = useState<{ tabId: string; name: string } | null>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const [readingLine, setReadingLine] = useState<number | null>(null);

  const tabs = useDocumentStore((s) => s.tabs);
  const activeTabId = useDocumentStore((s) => s.activeTabId);
  const layoutMode = useLayoutStore((s) => s.mode);
  const ratio = useLayoutStore((s) => s.ratio);
  const tocVisible = useLayoutStore((s) => s.tocVisible);
  const aiPanelVisible = useLayoutStore((s) => s.aiPanelVisible);

  /* ---------- 引用（不驱动渲染） ---------- */
  const editorRef = useRef<EditorHandle | null>(null);
  const schedulerRef = useRef<RenderScheduler | null>(null);
  const previewRef = useRef<PreviewControls | null>(null);
  const activeTabRef = useRef<{ id: string; path: string | null; name: string } | null>(null);
  const prevTabIdRef = useRef<string | null>(null);
  const configRef = useRef<UserConfig | null>(null);
  const tabInitialContent = useRef(new Map<string, string>());
  const autosaveRef = useRef(createAutosave(() => editorRef.current?.getText() ?? null));
  configRef.current = config;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  activeTabRef.current = activeTab ? { id: activeTab.id, path: activeTab.path, name: activeTab.name } : null;

  /* ---------- 词数统计（防抖，不逐键扫全文） ---------- */
  const updateWords = useMemo(
    () =>
      debounce(() => {
        const text = editorRef.current?.getText() ?? '';
        useUiStore.getState().setWords(countWords(text));
      }, 400),
    [],
  );

  /* ---------- 渲染调度 ---------- */
  const ensureScheduler = useCallback((): RenderScheduler => {
    if (!schedulerRef.current) {
      schedulerRef.current = createRenderScheduler({
        getSnapshot: () => ({
          markdown: editorRef.current?.getText() ?? '',
          revision: editorRef.current?.getRevision() ?? 0,
          docPath: activeTabRef.current?.path ?? null,
        }),
        onResult: (result) => {
          setRenderResult(result);
          useUiStore.getState().setRenderStats(result.parseMs, result.diagnostics.length);
          appBus.emit('preview:render-completed', {
            revision: result.revision,
            durationMs: result.parseMs,
            diagnostics: result.diagnostics.length,
          });
        },
        onFatal: (message) => toast('error', message),
      });
    }
    return schedulerRef.current;
  }, []);

  /* ---------- 编辑器装配 ---------- */
  const handleEditorReady = useCallback(
    (handle: EditorHandle) => {
      editorRef.current = handle;
      ensureScheduler().flush();
      updateWords();
    },
    [ensureScheduler, updateWords],
  );

  const editorOptions = useMemo(
    () => ({
      initialText: '',
      lineNumbers: configRef.current?.editor.lineNumbers ?? true,
      wordWrap: configRef.current?.editor.wordWrap ?? true,
      shortcuts: configRef.current?.shortcuts ?? {},
      onContentChanged: (event: { source: string; revision: number }) => {
        const tab = activeTabRef.current;
        if (tab && (event.source === 'user-input' || event.source === 'ai-apply')) {
          useDocumentStore.getState().markDirty(tab.id, true);
        }
        appBus.emit('editor:content-changed', {
          source: event.source as 'user-input' | 'ai-apply' | 'file-load',
          revision: event.revision,
        });
        ensureScheduler().request();
        updateWords();
      },
      onCursorMoved: (cursor: { line: number; column: number; offset: number }) => {
        useUiStore.getState().setCursor(cursor.line, cursor.column);
        appBus.emit('editor:cursor-moved', { line: cursor.line, column: cursor.column, offset: cursor.offset });
        setCursorLine((prev) => (prev === cursor.line ? prev : cursor.line));
      },
    }),
    // 编辑器只创建一次；选项经 setOptions 动态调整
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ---------- 文件动作 ---------- */
  const openFileAsTab = useCallback((file: OpenedFile) => {
    const { tabId, existed } = useDocumentStore.getState().openAsTab(file.path, file.name);
    if (!existed) tabInitialContent.current.set(tabId, file.content);
    void refreshRecent();
  }, []);

  const newTab = useCallback((content = '', pathInfo?: { path: string | null; name?: string }) => {
    const tabId = useDocumentStore.getState().newTab(pathInfo ?? { path: null });
    tabInitialContent.current.set(tabId, content);
    return tabId;
  }, []);

  const refreshRecent = async (): Promise<void> => {
    try {
      setRecentFiles(await bridge().file.recentList());
    } catch {
      /* 忽略 */
    }
  };

  const openViaDialog = useCallback(async () => {
    try {
      const file = await bridge().file.openDialog();
      if (file) openFileAsTab(file);
    } catch (err) {
      toast('error', `打开文件失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [openFileAsTab]);

  const openRecent = useCallback(
    async (path: string) => {
      try {
        const file = await bridge().file.read(path);
        openFileAsTab(file);
      } catch {
        toast('error', '文件不存在或无法读取，已从最近列表移除');
        void refreshRecent();
      }
    },
    [openFileAsTab],
  );

  const saveActive = useCallback(async (): Promise<boolean> => {
    const tab = activeTabRef.current;
    const handle = editorRef.current;
    if (!tab || !handle) return false;
    const text = handle.getText();
    useUiStore.getState().setSaving(true);
    try {
      if (tab.path) {
        await bridge().file.save(tab.path, text);
        useDocumentStore.getState().markDirty(tab.id, false);
        autosaveRef.current.clearDraft(tab.id);
        return true;
      }
      const saved = await bridge().file.saveAs(tab.name === '未命名' ? '未命名.md' : tab.name, text);
      if (!saved) return false;
      useDocumentStore.getState().bindPath(tab.id, saved.path, saved.name);
      useDocumentStore.getState().markDirty(tab.id, false);
      autosaveRef.current.clearDraft(tab.id);
      void refreshRecent();
      return true;
    } catch (err) {
      toast('error', `保存失败：${err instanceof Error ? err.message : '未知错误'}`);
      return false;
    } finally {
      useUiStore.getState().setSaving(false);
    }
  }, []);

  const saveAsActive = useCallback(async () => {
    const tab = activeTabRef.current;
    const handle = editorRef.current;
    if (!tab || !handle) return;
    try {
      const saved = await bridge().file.saveAs(tab.name.endsWith('.md') ? tab.name : `${tab.name}.md`, handle.getText());
      if (saved) {
        useDocumentStore.getState().bindPath(tab.id, saved.path, saved.name);
        useDocumentStore.getState().markDirty(tab.id, false);
        autosaveRef.current.clearDraft(tab.id);
        void refreshRecent();
        toast('success', `已另存为 ${saved.name}`);
      }
    } catch (err) {
      toast('error', `另存为失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  const requestCloseTab = useCallback((tabId: string) => {
    const tab = useDocumentStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.dirty) {
      setConfirmClose({ tabId, name: tab.name });
    } else {
      doCloseTab(tabId);
    }
  }, []);

  const doCloseTab = (tabId: string): void => {
    autosaveRef.current.clearDraft(tabId);
    tabStateStore.drop(tabId);
    tabInitialContent.current.delete(tabId);
    useDocumentStore.getState().close(tabId);
  };

  /* ---------- 导出 ---------- */
  const doExport = useCallback(async (kind: 'html' | 'pdf') => {
    const tab = activeTabRef.current;
    const handle = editorRef.current;
    if (!tab || !handle) {
      toast('warning', '没有可导出的文档');
      return;
    }
    const input = {
      markdown: handle.getText(),
      docPath: tab.path,
      fileName: tab.name.endsWith('.md') ? tab.name : `${tab.name}.md`,
      themeVars: themeEngine.previewVars(),
    };
    try {
      const result = kind === 'html' ? await exportAsHtml(input) : await exportAsPdf(input);
      if (result) toast('success', `已导出：${fileNameOf(result.path)}`);
    } catch (err) {
      toast('error', `导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  /* ---------- 主题 ---------- */
  const syncThemeUi = useCallback((editorThemeId: string) => {
    const summary = themeEngine.list().find((t) => t.id === editorThemeId);
    useUiStore.getState().setThemeName(summary?.name ?? editorThemeId);
  }, []);

  const pickTheme = useCallback(
    async (themeId: string) => {
      const cfg = configRef.current;
      const applied = await themeEngine.setTheme({ editorThemeId: themeId, linked: cfg?.theme.linked ?? true });
      syncThemeUi(applied.editorThemeId);
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              theme: {
                ...prev.theme,
                editorThemeId: applied.editorThemeId,
                previewThemeId: applied.previewThemeId,
              },
            }
          : prev,
      );
      if (applied.fellBack) toast('warning', '所选主题不可用，已回退默认浅色主题');
    },
    [syncThemeUi],
  );

  /* ---------- 菜单命令路由 ---------- */
  const handleMenuCommand = useCallback(
    (command: MenuCommand) => {
      const layout = useLayoutStore.getState();
      switch (command) {
        case 'file.new':
          newTab();
          break;
        case 'file.open':
          void openViaDialog();
          break;
        case 'file.save':
          void saveActive();
          break;
        case 'file.saveAs':
          void saveAsActive();
          break;
        case 'file.closeTab':
          if (activeTabRef.current) requestCloseTab(activeTabRef.current.id);
          break;
        case 'file.exportHtml':
          void doExport('html');
          break;
        case 'file.exportPdf':
          void doExport('pdf');
          break;
        case 'view.modeSplit':
          layout.setMode('split');
          break;
        case 'view.modeEditor':
          layout.setMode('editor');
          break;
        case 'view.modePreview':
          layout.setMode('preview');
          break;
        case 'view.toggleToc':
          layout.toggleToc();
          break;
        case 'view.toggleAiPanel':
          layout.toggleAiPanel();
          break;
        case 'view.openSettings':
          setSettingsSection('general');
          setSettingsOpen(true);
          break;
        case 'theme.next':
          void themeEngine.nextTheme(configRef.current?.theme.linked ?? true).then((applied) => {
            syncThemeUi(applied.editorThemeId);
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    theme: {
                      ...prev.theme,
                      editorThemeId: applied.editorThemeId,
                      previewThemeId: applied.previewThemeId,
                    },
                  }
                : prev,
            );
          });
          break;
        case 'help.about':
          setAboutOpen(true);
          break;
        default:
          if (command.startsWith('theme.pick.')) {
            void pickTheme(command.slice('theme.pick.'.length));
          }
      }
    },
    [newTab, openViaDialog, saveActive, saveAsActive, requestCloseTab, doExport, pickTheme, syncThemeUi],
  );
  const menuHandlerRef = useRef(handleMenuCommand);
  menuHandlerRef.current = handleMenuCommand;

  /* ---------- 初始化 ---------- */
  useEffect(() => {
    let disposed = false;
    const autosave = autosaveRef.current;
    void (async () => {
      try {
        const cfg = await bridge().config.get();
        if (disposed) return;
        setConfig(cfg);
        useLayoutStore.getState().hydrate(cfg.layout);
        useAiStore.getState().hydrateProfiles(cfg.ai.profiles, cfg.ai.activeProfileId);

        const applied = await themeEngine.init(cfg.theme.editorThemeId, cfg.theme.previewThemeId);
        if (disposed) return;
        setThemes(themeEngine.list());
        syncThemeUi(applied.editorThemeId);
        if (applied.fellBack) toast('warning', '持久化主题不可用，已回退默认浅色主题');

        await refreshRecent();

        // 崩溃恢复提示（可用性 §3.3）
        const drafts = await bridge().drafts.list();
        if (!disposed && drafts.length > 0) setRecoveryDrafts(drafts);
      } catch (err) {
        if (!disposed) {
          const message = err instanceof Error ? err.message : '未知错误';
          console.error('应用初始化失败', err);
          toast('error', `应用初始化失败：${message}`);
        }
      }
    })();

    const offMenu = bridge().events.onMenuCommand((payload) => {
      menuHandlerRef.current((payload as { command: MenuCommand }).command);
    });
    const offOpenPath = bridge().events.onOpenPath((payload) => {
      openFileAsTab(payload as OpenedFile);
    });

    return () => {
      disposed = true;
      offMenu();
      offOpenPath();
      schedulerRef.current?.dispose();
      autosave.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 标签切换：编辑器状态捕获/恢复 ---------- */
  useEffect(() => {
    const handle = editorRef.current;
    if (!handle) return;
    const prevId = prevTabIdRef.current;
    if (prevId && prevId !== activeTabId && useDocumentStore.getState().tabs.some((t) => t.id === prevId)) {
      tabStateStore.saveEditorState(prevId, handle.captureState(), handle.getText());
    }
    prevTabIdRef.current = activeTabId;
    if (!activeTabId) return;

    const savedState = tabStateStore.takeEditorState(activeTabId);
    if (savedState) {
      handle.restoreState(savedState);
    } else {
      const initial = tabInitialContent.current.get(activeTabId) ?? tabStateStore.textOf(activeTabId) ?? '';
      tabInitialContent.current.delete(activeTabId);
      handle.setText(initial, 'file-load');
    }
    handle.focus();
    ensureScheduler().flush();
    updateWords();
  }, [activeTabId, ensureScheduler, updateWords]);

  /* ---------- 窗口标题 ---------- */
  useEffect(() => {
    if (!isElectron()) return;
    const title = activeTab ? activeTab.name : 'MD工具箱';
    void bridge().window.setTitle(title, activeTab?.path ?? null, activeTab?.dirty ?? false);
  }, [activeTab]);

  /* ---------- 配置生效：编辑器选项 / 字号 / 自动保存 / AI ---------- */
  useEffect(() => {
    if (!config) return;
    editorRef.current?.setOptions({
      lineNumbers: config.editor.lineNumbers,
      wordWrap: config.editor.wordWrap,
      shortcuts: config.shortcuts,
    });
    document.documentElement.style.setProperty('--mk-editor-font-size', `${config.editor.fontSize}px`);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    autosaveRef.current.configure(config.autosave);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    useAiStore.getState().hydrateProfiles(config.ai.profiles, config.ai.activeProfileId);
  }, [config]);

  /* ---------- 设置面板主题变更 → 引擎应用 ---------- */
  useEffect(() => {
    if (!config) return;
    const active = themeEngine.getActive();
    if (
      active.editorThemeId !== config.theme.editorThemeId ||
      active.previewThemeId !== config.theme.previewThemeId
    ) {
      void themeEngine
        .setTheme({
          editorThemeId: config.theme.editorThemeId,
          previewThemeId: config.theme.previewThemeId,
          linked: config.theme.linked,
        })
        .then((applied) => {
          syncThemeUi(applied.editorThemeId);
          if (applied.fellBack) toast('warning', '主题不可用，已回退默认浅色主题');
        });
    }
  }, [config, syncThemeUi]);

  /* ---------- 布局持久化（防抖） ---------- */
  const persistLayout = useMemo(
    () =>
      debounce((mode: string, r: number, toc: boolean, ai: boolean) => {
        void bridge().config.patch({
          layout: { mode: mode as 'split' | 'editor' | 'preview', ratio: r, tocVisible: toc, aiPanelVisible: ai },
        });
      }, 600),
    [],
  );
  useEffect(() => {
    if (!config) return;
    persistLayout(layoutMode, ratio, tocVisible, aiPanelVisible);
  }, [layoutMode, ratio, tocVisible, aiPanelVisible, config, persistLayout]);

  /* ---------- 拖拽打开（F1.7） ---------- */
  useEffect(() => {
    const onDragOver = (e: DragEvent): void => e.preventDefault();
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      for (const file of files) {
        if (!/\.(md|markdown)$/i.test(file.name)) {
          toast('warning', `已忽略非 Markdown 文件：${file.name}`);
          continue;
        }
        try {
          const path = bridge().file.pathForFile(file);
          void bridge()
            .file.openDropped(path)
            .then(openFileAsTab)
            .catch(() => toast('error', `无法打开 ${file.name}`));
        } catch {
          // 浏览器环境：直接读内容为新标签
          void file.text().then((content) => newTab(content, { path: null, name: file.name }));
        }
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openFileAsTab, newTab]);

  /* ---------- AI 行内辅助快捷键（F7.5，默认 Mod-k，可自定义） ---------- */
  useEffect(() => {
    const binding = config?.shortcuts['ai.inlineAssist'] ?? 'Mod-k';
    const matcher = parseKeyBinding(binding);
    const onKey = (e: KeyboardEvent): void => {
      if (!matcher(e) || !activeTabRef.current) return;
      e.preventDefault();
      const handle = editorRef.current;
      if (!handle) return;
      useAiStore.getState().openInline(handle.getSelection());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config]);

  /* ---------- 预览回调 ---------- */
  const handleOpenExternal = useCallback((url: string) => {
    void bridge().shell.openExternal(url);
  }, []);
  const handleImageClick = useCallback((src: string, alt: string) => setLightbox({ src, alt }), []);
  const handleAnchorChanged = useCallback((line: number, type: 'heading' | 'block') => {
    setReadingLine((prev) => (prev === line ? prev : line));
    appBus.emit('preview:scroll-anchor-changed', { anchorLine: line, anchorType: type });
  }, []);
  const handlePreviewReady = useCallback((controls: PreviewControls) => {
    previewRef.current = controls;
  }, []);

  /* ---------- AI 面板回调 ---------- */
  const getDocContext = useCallback(() => {
    const handle = editorRef.current;
    const tab = activeTabRef.current;
    if (!handle || !tab) return null;
    return {
      docText: handle.getText(),
      cursorOffset: handle.getCursor().offset,
      selectionText: handle.getSelection().text,
      fileName: tab.name,
    };
  }, []);
  const applyAiEdits = useCallback((edits: Array<{ from: number; to: number; insert: string }>) => {
    editorRef.current?.applyEdits(edits, 'ai-apply');
    toast('success', 'AI 修改已应用（Ctrl+Z 可撤销）');
  }, []);
  const applyInlineReplace = useCallback((from: number, to: number, text: string) => {
    editorRef.current?.applyEdits([{ from, to, insert: text }], 'ai-apply');
    toast('success', 'AI 内容已写入（Ctrl+Z 可撤销）');
  }, []);
  const openAiSettings = useCallback(() => {
    setSettingsSection('ai');
    setSettingsOpen(true);
  }, []);

  /* ---------- 恢复草稿 ---------- */
  const restoreDrafts = useCallback(() => {
    if (!recoveryDrafts) return;
    for (const draft of recoveryDrafts) {
      const tabId = newTab(draft.content, {
        path: draft.path,
        name: draft.path ? fileNameOf(draft.path) : '恢复的草稿',
      });
      useDocumentStore.getState().markDirty(tabId, true);
    }
    setRecoveryDrafts(null);
    toast('info', `已恢复 ${recoveryDrafts.length} 份未保存草稿`);
  }, [recoveryDrafts, newTab]);

  const discardDrafts = useCallback(() => {
    if (!recoveryDrafts) return;
    for (const draft of recoveryDrafts) autosaveRef.current.clearDraft(draft.tabId);
    setRecoveryDrafts(null);
  }, [recoveryDrafts]);

  const showEditorStack = tabs.length > 0;

  return (
    <div className="mk-app" data-testid="app-root">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={(id) => useDocumentStore.getState().activate(id)}
        onClose={requestCloseTab}
        onNew={() => newTab()}
      />

      <div className="mk-main">
        {tocVisible && showEditorStack && (
          <TocPanel
            toc={renderResult?.toc ?? []}
            activeLine={readingLine}
            onNavigate={(line) => previewRef.current?.scrollToLine(line)}
            onClose={() => useLayoutStore.getState().toggleToc()}
          />
        )}

        <div className="mk-workbench" style={{ display: showEditorStack ? undefined : 'none' }}>
          <SplitPane
            mode={layoutMode}
            ratio={ratio}
            onRatioChange={(r) => useLayoutStore.getState().setRatio(r)}
            left={<EditorPanel options={editorOptions} onReady={handleEditorReady} />}
            right={
              <PreviewPanel
                result={renderResult}
                dark={themeEngine.getActive().previewDark}
                cursorLine={cursorLine}
                syncCursor={layoutMode === 'split'}
                onOpenExternal={handleOpenExternal}
                onImageClick={handleImageClick}
                onAnchorChanged={handleAnchorChanged}
                onReady={handlePreviewReady}
              />
            }
          />
        </div>

        {!showEditorStack && (
          <WelcomeView
            recentFiles={recentFiles}
            onNew={() => newTab()}
            onOpen={() => void openViaDialog()}
            onOpenRecent={(path) => void openRecent(path)}
            onClearRecent={() => {
              void bridge().file.recentClear().then(refreshRecent);
            }}
          />
        )}

        {aiPanelVisible && (
          <ChatPanel
            getDocContext={getDocContext}
            onApplyEdits={applyAiEdits}
            onOpenSettings={openAiSettings}
            onClose={() => useLayoutStore.getState().toggleAiPanel()}
          />
        )}
      </div>

      <StatusBar />
      <ToastHost />
      <InlineAssist onReplace={applyInlineReplace} />
      <ImageLightbox src={lightbox?.src ?? null} alt={lightbox?.alt ?? ''} onClose={() => setLightbox(null)} />

      {config && (
        <SettingsDialog
          open={settingsOpen}
          config={config}
          themes={themes}
          initialSection={settingsSection}
          onClose={() => setSettingsOpen(false)}
          onConfigChanged={(next) => {
            setConfig(next);
            setThemes(themeEngine.list());
          }}
          onImportTheme={async () => {
            const error = await themeEngine.importCustom();
            if (error) toast('error', `主题导入失败：${error}`);
            else {
              setThemes(themeEngine.list());
              toast('success', '主题已导入，可在下拉列表中选用');
            }
          }}
        />
      )}

      {/* 关闭脏标签确认 */}
      <Modal
        open={confirmClose !== null}
        title="关闭前保存？"
        onClose={() => setConfirmClose(null)}
        footer={
          <>
            <button
              type="button"
              className="mk-btn mk-danger"
              onClick={() => {
                if (confirmClose) doCloseTab(confirmClose.tabId);
                setConfirmClose(null);
              }}
            >
              不保存
            </button>
            <button type="button" className="mk-btn" onClick={() => setConfirmClose(null)}>
              取消
            </button>
            <button
              type="button"
              className="mk-btn mk-btn-primary"
              onClick={() => {
                const target = confirmClose;
                setConfirmClose(null);
                void saveActive().then((ok) => {
                  if (ok && target) doCloseTab(target.tabId);
                });
              }}
            >
              保存并关闭
            </button>
          </>
        }
      >
        <p>「{confirmClose?.name}」有未保存的修改。</p>
      </Modal>

      {/* 崩溃恢复提示 */}
      <Modal
        open={recoveryDrafts !== null}
        title="发现未保存的草稿"
        onClose={discardDrafts}
        footer={
          <>
            <button type="button" className="mk-btn" onClick={discardDrafts}>
              丢弃
            </button>
            <button type="button" className="mk-btn mk-btn-primary" onClick={restoreDrafts}>
              恢复 {recoveryDrafts?.length ?? 0} 份草稿
            </button>
          </>
        }
      >
        <p>上次会话存在未保存内容（可能因意外退出）。是否恢复？</p>
        <ul className="mk-recovery-list">
          {(recoveryDrafts ?? []).map((d) => (
            <li key={d.tabId}>
              {d.path ? fileNameOf(d.path) : '未命名文档'} ·{' '}
              {new Date(d.savedAt).toLocaleString('zh-CN')}
            </li>
          ))}
        </ul>
      </Modal>

      {/* 关于 */}
      <Modal open={aboutOpen} title="关于 MD工具箱" onClose={() => setAboutOpen(false)}>
        <div className="mk-about">
          <p className="mk-about-name">MD工具箱</p>
          <p>轻量、离线、所见即所得的 Markdown 编辑与预览工具箱。</p>
          <p className="mk-about-meta">Electron · React · CodeMirror 6 · unified · KaTeX</p>
        </div>
      </Modal>
    </div>
  );
}

/** 解析 "Mod-k" / "Ctrl-Shift-p" 形式的键位描述为事件匹配器 */
function parseKeyBinding(binding: string): (e: KeyboardEvent) => boolean {
  const parts = binding.split('-').map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const needMod = parts.includes('mod') || parts.includes('ctrl') || parts.includes('cmdorctrl');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  return (e) =>
    e.key.toLowerCase() === key &&
    (e.ctrlKey || e.metaKey) === needMod &&
    e.shiftKey === needShift &&
    e.altKey === needAlt;
}
