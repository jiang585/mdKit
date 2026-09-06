//! 系统杂项命令：外链打开 / 窗口标题 / 渲染进程错误日志。

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::constants::{APP_NAME, SAFE_LINK_PROTOCOLS};
use crate::logger;
use crate::state::AppState;

#[derive(Serialize)]
pub struct OkResult {
    pub ok: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalReq {
    pub url: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTitleReq {
    pub title: String,
    pub document_path: Option<String>,
    pub dirty: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererErrorReq {
    pub message: String,
    pub stack: Option<String>,
}

#[tauri::command]
pub fn shell_open_external(payload: OpenExternalReq) -> Result<OkResult, String> {
    // 协议白名单（对齐 window.ts openExternalSafe）
    let allowed = tauri::Url::parse(&payload.url)
        .ok()
        .map(|u| SAFE_LINK_PROTOCOLS.contains(&u.scheme()))
        .unwrap_or(false);
    if allowed {
        if let Err(err) = open::that_detached(&payload.url) {
            logger::error(&format!("外链打开失败：{err}"));
        }
    } else {
        logger::warn(&format!(
            "拦截非白名单协议外链：{}",
            tauri::Url::parse(&payload.url).map(|u| u.scheme().to_string()).unwrap_or_else(|_| "非法 URL".into())
        ));
    }
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn window_set_title(app: AppHandle, payload: SetTitleReq) -> Result<OkResult, String> {
    let dirty_mark = if payload.dirty { "● " } else { "" };
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_title(&format!("{dirty_mark}{} — {APP_NAME}", payload.title));
    }
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn log_renderer_error(state: State<'_, AppState>, payload: RendererErrorReq) -> Result<OkResult, String> {
    let _ = state;
    logger::error(&format!("渲染进程错误：{}", payload.message));
    Ok(OkResult { ok: true })
}
