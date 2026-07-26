/**
 * 原生菜单栏：文件 / 编辑 / 视图 / 主题 / 帮助（界面需求 §5.1）。
 * 菜单命令统一路由到渲染进程（menu:command），快捷键支持用户自定义覆盖（E7）。
 */
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC_PUSH, type MenuCommand } from '@shared/ipc-contract';
import { getConfig } from './config-store';

/** 默认快捷键（U3：沿用 VSCode 习惯） */
const DEFAULT_ACCELERATORS: Partial<Record<MenuCommand, string>> = {
  'file.new': 'CmdOrCtrl+N',
  'file.open': 'CmdOrCtrl+O',
  'file.save': 'CmdOrCtrl+S',
  'file.saveAs': 'CmdOrCtrl+Shift+S',
  'file.closeTab': 'CmdOrCtrl+W',
  'view.modeSplit': 'CmdOrCtrl+Alt+1',
  'view.modeEditor': 'CmdOrCtrl+Alt+2',
  'view.modePreview': 'CmdOrCtrl+Alt+3',
  'view.toggleToc': 'CmdOrCtrl+Alt+T',
  'view.toggleAiPanel': 'CmdOrCtrl+Alt+A',
  'view.openSettings': 'CmdOrCtrl+,',
  'theme.next': 'CmdOrCtrl+K CmdOrCtrl+T',
};

function acc(command: MenuCommand): string | undefined {
  const overrides = getConfig().shortcuts;
  return overrides[command] ?? DEFAULT_ACCELERATORS[command];
}

export function rebuildMenu(win: BrowserWindow): void {
  const send = (command: MenuCommand) => (): void => {
    win.webContents.send(IPC_PUSH.menuCommand, { command });
  };
  const cfg = getConfig();
  const activeTheme = cfg.theme.editorThemeId;

  const themeRadio = (id: MenuCommand, label: string, themeId: string): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: activeTheme === themeId,
    click: send(id),
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: acc('file.new'), click: send('file.new') },
        { label: '打开…', accelerator: acc('file.open'), click: send('file.open') },
        { type: 'separator' },
        { label: '保存', accelerator: acc('file.save'), click: send('file.save') },
        { label: '另存为…', accelerator: acc('file.saveAs'), click: send('file.saveAs') },
        { type: 'separator' },
        { label: '导出 HTML…', click: send('file.exportHtml') },
        { label: '导出 PDF…', click: send('file.exportPdf') },
        { type: 'separator' },
        { label: '关闭标签页', accelerator: acc('file.closeTab'), click: send('file.closeTab') },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '分屏模式', accelerator: acc('view.modeSplit'), click: send('view.modeSplit') },
        { label: '纯编辑模式', accelerator: acc('view.modeEditor'), click: send('view.modeEditor') },
        { label: '纯预览模式', accelerator: acc('view.modePreview'), click: send('view.modePreview') },
        { type: 'separator' },
        { label: '目录（TOC）', accelerator: acc('view.toggleToc'), click: send('view.toggleToc') },
        { label: 'AI 助手面板', accelerator: acc('view.toggleAiPanel'), click: send('view.toggleAiPanel') },
        { type: 'separator' },
        { label: '设置…', accelerator: acc('view.openSettings'), click: send('view.openSettings') },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '主题',
      submenu: [
        { label: '切换下一个主题', accelerator: acc('theme.next'), click: send('theme.next') },
        { type: 'separator' },
        themeRadio('theme.pick.light-default', '默认浅色', 'light-default'),
        themeRadio('theme.pick.light-sepia', '纸墨浅色', 'light-sepia'),
        themeRadio('theme.pick.dark-default', '默认深色', 'dark-default'),
        themeRadio('theme.pick.dark-ocean', '海蓝深色', 'dark-ocean'),
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 MD工具箱', click: send('help.about') },
        { label: `版本 ${app.getVersion()}`, enabled: false },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
