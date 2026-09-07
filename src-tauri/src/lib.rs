//! 应用装配：Builder + 插件 + 命令注册 + 菜单 + 单实例 + CLI 打开 .md。
//! 主进程不解析 Markdown、不持有编辑器 UI 状态（决策输入 §4）。

mod asset_proto;
mod commands;
mod config;
mod constants;
mod fsx;
pub mod legacy_crypto;
mod logger;
mod menu;
mod paths;
mod pdf;
mod state;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::{AiState, AppState};

/// argv 中的 .md 路径（双击文件 / 拖到 exe 图标 / 关联打开）
fn md_path_from_argv(argv: &[String]) -> Option<String> {
    argv.iter()
        .skip(1)
        .find_map(|a| {
            let clean = a.trim().trim_matches('"').trim_matches('\'');
            if clean.is_empty() || clean.starts_with('-') {
                return None;
            }
            let lower = clean.to_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                Some(clean.to_string())
            } else {
                None
            }
        })
}

/// 命令行/二次实例打开：授权并读取后推送 app:open-path
fn open_and_push(app: &AppHandle, path: &str) {
    let state: State<AppState> = app.state();
    state.grant_path(path);
    state.set_pending_open(path.to_string());
    match fsx::read_text_lossy(std::path::Path::new(path)) {
        Ok(content) => {
            let name = std::path::Path::new(path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string());
            config::touch_recent_file(&state, path, &name);
            if let Some(dir) = std::path::Path::new(path).parent() {
                state.allow_doc_dir(&dir.to_string_lossy());
            }

            let _ = app.emit(
                "app:open-path",
                json!({ "path": path, "name": name, "content": content }),
            );
        }
        Err(err) => logger::error(&format!("通过命令行/二次实例打开文件失败：{err}")),
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            if let Some(path) = md_path_from_argv(&argv.iter().map(String::as_str).map(str::to_string).collect::<Vec<_>>()) {
                open_and_push(app, &path);
            }
        }))
        .manage(AppState::default())
        .manage(AiState::default())
        .register_uri_scheme_protocol(crate::constants::DOC_ASSET_PROTOCOL, |ctx, request| {
            asset_proto::handle(ctx, request)
        })
        .on_page_load(|webview, payload| {
            if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                return;
            }
            if webview.label() != "main" {
                return;
            }
            // 隐形诊断模式：MDKIT_SHOW_WINDOW=0 时不显示窗口（无人值守自检用）
            if std::env::var("MDKIT_SHOW_WINDOW").as_deref() != Ok("0") {
                if let Some(app) = webview.app_handle().get_webview_window("main") {
                    let _ = app.show();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // 文件
            commands::file::file_get_pending_open,
            commands::file::file_open_dialog,
            commands::file::file_open_dropped,
            commands::file::file_read,
            commands::file::file_save,
            commands::file::file_save_as,
            commands::file::file_recent_list,
            commands::file::file_recent_clear,
            // 配置
            commands::config_cmd::config_get,
            commands::config_cmd::config_patch,
            // 主题
            commands::theme::theme_import,
            commands::theme::theme_list_custom,
            // 导出
            commands::export::export_html,
            commands::export::export_pdf,
            // 系统
            commands::misc::shell_open_external,
            commands::misc::window_set_title,
            // 草稿
            commands::draft::draft_save,
            commands::draft::draft_clear,
            commands::draft::draft_list,
            // 日志
            commands::misc::log_renderer_error,
            // AI
            commands::ai::ai_chat_start,
            commands::ai::ai_chat_cancel,
            commands::ai::ai_secret_set,
            commands::ai::ai_secret_status,
            commands::ai::ai_test_connection,
        ])
        .setup(|app| {
            menu::rebuild_menu(app.handle());
            // 记录首启命令行 .md 参数
            let argv: Vec<String> = std::env::args().collect();
            if let Some(path) = md_path_from_argv(&argv) {
                let state: State<AppState> = app.state();
                state.grant_path(&path);
                state.set_pending_open(path);
            }
            logger::info("应用启动完成");
            Ok(())
        })
        .on_menu_event(menu::on_menu_event)
        .run(tauri::generate_context!())
        .expect("MD工具箱启动失败");
}
