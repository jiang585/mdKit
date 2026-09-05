//! 原生菜单栏：文件 / 编辑 / 视图 / 主题 / 帮助（对齐 menu.ts）。
//! 菜单命令统一路由到渲染进程（menu:command），快捷键支持用户自定义覆盖（E7）。

use serde_json::json;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::config;
use crate::state::AppState;

/// 默认快捷键（U3：沿用 VSCode 习惯）
fn default_accelerator(command: &str) -> Option<&'static str> {
    match command {
        "file.new" => Some("CmdOrCtrl+N"),
        "file.open" => Some("CmdOrCtrl+O"),
        "file.save" => Some("CmdOrCtrl+S"),
        "file.saveAs" => Some("CmdOrCtrl+Shift+S"),
        "file.closeTab" => Some("CmdOrCtrl+W"),
        "view.modeSplit" => Some("CmdOrCtrl+Alt+1"),
        "view.modeEditor" => Some("CmdOrCtrl+Alt+2"),
        "view.modePreview" => Some("CmdOrCtrl+Alt+3"),
        "view.toggleToc" => Some("CmdOrCtrl+Alt+T"),
        "view.toggleAiPanel" => Some("CmdOrCtrl+Alt+A"),
        "view.openSettings" => Some("CmdOrCtrl+,"),
        "theme.next" => Some("CmdOrCtrl+Shift+T"),
        _ => None,
    }
}

/// Electron 风格 "Mod+X" → Tauri 风格 "CmdOrCtrl+X"
fn normalize_accel(input: &str) -> String {
    input.replace("Mod+", "CmdOrCtrl+")
}

fn acc(state: &AppState, command: &str) -> Option<String> {
    let cfg = config::get_config(state);
    if let Some(overridden) = cfg["shortcuts"].get(command).and_then(|v| v.as_str()) {
        return Some(normalize_accel(overridden));
    }
    default_accelerator(command).map(normalize_accel)
}

fn theme_checked(state: &AppState, theme_id: &str) -> bool {
    config::get_config(state)["theme"]["editorThemeId"]
        .as_str()
        .map_or(false, |v| v == theme_id)
}

pub fn rebuild_menu(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let st = state.inner();
    let build = || -> tauri::Result<Menu<Wry>> {
        let item = |app: &AppHandle, id: &str, label: &str, accel: Option<String>| {
            MenuItem::with_id(app, id, label, true, accel.as_deref())
        };
        let theme_item = |app: &AppHandle, id: &str, label: &str, theme_id: &str, checked: bool| {
            CheckMenuItem::with_id(app, id, label, true, checked, None::<&str>)
        };

        let quit = PredefinedMenuItem::close_window(app, Some("退出"))?;

        let file_menu = SubmenuBuilder::new(app, "文件")
            .item(&item(app, "file.new", "新建", acc(st, "file.new"))?)
            .item(&item(app, "file.open", "打开…", acc(st, "file.open"))?)
            .separator()
            .item(&item(app, "file.save", "保存", acc(st, "file.save"))?)
            .item(&item(app, "file.saveAs", "另存为…", acc(st, "file.saveAs"))?)
            .separator()
            .item(&item(app, "file.exportHtml", "导出 HTML…", None)?)
            .item(&item(app, "file.exportPdf", "导出 PDF…", None)?)
            .separator()
            .item(&item(app, "file.closeTab", "关闭标签页", acc(st, "file.closeTab"))?)
            .separator()
            .item(&quit)
            .build()?;

        let edit_menu = SubmenuBuilder::new(app, "编辑")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;

        let reload = item(app, "app.reload", "重新加载", None)?;
        let devtools = item(app, "app.devtools", "开发者工具", None)?;
        let view_menu = SubmenuBuilder::new(app, "视图")
            .item(&item(app, "view.modeSplit", "分屏模式", acc(st, "view.modeSplit"))?)
            .item(&item(app, "view.modeEditor", "纯编辑模式", acc(st, "view.modeEditor"))?)
            .item(&item(app, "view.modePreview", "纯预览模式", acc(st, "view.modePreview"))?)
            .separator()
            .item(&item(app, "view.toggleToc", "目录（TOC）", acc(st, "view.toggleToc"))?)
            .item(&item(app, "view.toggleAiPanel", "AI 助手面板", acc(st, "view.toggleAiPanel"))?)
            .separator()
            .item(&item(app, "view.openSettings", "设置…", acc(st, "view.openSettings"))?)
            .separator()
            .item(&reload)
            .item(&devtools)
            .build()?;

        let theme_menu = SubmenuBuilder::new(app, "主题")
            .item(&item(app, "theme.next", "切换下一个主题", acc(st, "theme.next"))?)
            .separator()
            .item(&theme_item(app, "theme.pick.light-default", "默认浅色", "light-default", theme_checked(st, "light-default"))?)
            .item(&theme_item(app, "theme.pick.light-sepia", "纸墨浅色", "light-sepia", theme_checked(st, "light-sepia"))?)
            .item(&theme_item(app, "theme.pick.dark-default", "默认深色", "dark-default", theme_checked(st, "dark-default"))?)
            .item(&theme_item(app, "theme.pick.dark-ocean", "海蓝深色", "dark-ocean", theme_checked(st, "dark-ocean"))?)
            .build()?;

        let version_item = MenuItem::with_id(
            app,
            "app.version",
            format!("版本 {}", app.package_info().version),
            false,
            None::<&str>,
        )?;
        let help_menu = SubmenuBuilder::new(app, "帮助")
            .item(&item(app, "help.about", "关于 MD工具箱", None)?)
            .item(&version_item)
            .build()?;

        tauri::menu::MenuBuilder::new(app)
            .item(&file_menu)
            .item(&edit_menu)
            .item(&view_menu)
            .item(&theme_menu)
            .item(&help_menu)
            .build()
    };
    match build() {
        Ok(menu) => {
            if let Err(err) = app.set_menu(menu) {
                crate::logger::error(&format!("菜单设置失败：{err}"));
            }
        }
        Err(err) => crate::logger::error(&format!("菜单构建失败：{err}")),
    }
}

pub fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    match id {
        "app.reload" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.reload();
            }
        }
        "app.devtools" => {
            if let Some(win) = app.get_webview_window("main") {
                win.open_devtools();
            }
        }
        "app.version" => {}
        _ => {
            // 菜单命令统一路由到渲染进程（对齐 IPC_PUSH.menuCommand）
            let _ = app.emit("menu:command", json!({ "command": id }));
        }
    }
}
