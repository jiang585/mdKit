//! 文件命令：打开/读取/保存/另存为/最近文件（授权集合语义对齐 file-service.ts）。

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::{OpenedFile, PathReq, SaveAsReq, SaveReq};
use crate::config;
use crate::logger;
use crate::state::AppState;

const MD_EXTENSIONS: [&str; 2] = ["md", "markdown"];

#[derive(Serialize)]
pub struct OkResult {
    pub ok: bool,
}

#[derive(Serialize)]
pub struct SavedAs {
    pub path: String,
    pub name: String,
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

fn read_opened(state: &AppState, path: &str) -> Result<OpenedFile, String> {
    state.assert_granted(path)?;
    let content = crate::fsx::read_text_lossy(Path::new(path)).map_err(|e| e.to_string())?;
    let name = file_name(path);
    config::touch_recent_file(state, path, &name);
    Ok(OpenedFile { path: path.to_string(), name, content })
}

fn allow_doc_dir_of(state: &AppState, path: &str) {
    if let Some(dir) = Path::new(path).parent() {
        state.allow_doc_dir(&dir.to_string_lossy());
    }
}

fn blocking_pick_markdown(app: &AppHandle, title: &str) -> Option<PathBuf> {
    app.dialog()
        .file()
        .set_title(title)
        .add_filter("Markdown", &MD_EXTENSIONS)
        .add_filter("所有文件", &["*"])
        .blocking_pick_file()
        .and_then(|fp| fp.into_path().ok())
}

#[tauri::command]
pub async fn file_open_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<OpenedFile>, String> {
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        blocking_pick_markdown(&app2, "打开 Markdown 文件")
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };
    let path_str = path.to_string_lossy().into_owned();
    state.grant_path(&path_str);
    let opened = read_opened(&state, &path_str)?;
    allow_doc_dir_of(&state, &path_str);
    Ok(Some(opened))
}

#[tauri::command]
pub fn file_open_dropped(state: State<'_, AppState>, payload: PathReq) -> Result<OpenedFile, String> {
    // 拖拽入口：仅放行 Markdown 扩展名（对齐 openDroppedReqSchema）
    let lower = payload.path.to_lowercase();
    if !lower.ends_with(".md") && !lower.ends_with(".markdown") {
        return Err("仅支持 Markdown 文件".into());
    }
    state.grant_path(&payload.path);
    let opened = read_opened(&state, &payload.path)?;
    allow_doc_dir_of(&state, &payload.path);
    Ok(opened)
}

#[tauri::command]
pub fn file_read(state: State<'_, AppState>, payload: PathReq) -> Result<OpenedFile, String> {
    let opened = read_opened(&state, &payload.path)?;
    allow_doc_dir_of(&state, &payload.path);
    Ok(opened)
}

#[tauri::command]
pub fn file_save(state: State<'_, AppState>, payload: SaveReq) -> Result<OkResult, String> {
    state.assert_granted(&payload.path)?;
    std::fs::write(&payload.path, payload.content.as_bytes()).map_err(|e| e.to_string())?;
    let name = file_name(&payload.path);
    logger::info(&format!("已保存文档 {name}（{} 字符）", payload.content.chars().count()));
    config::touch_recent_file(&state, &payload.path, &name);
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn file_save_as(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: SaveAsReq,
) -> Result<Option<SavedAs>, String> {
    let default_path = if payload.default_name.is_empty() {
        "未命名.md".to_string()
    } else {
        payload.default_name.clone()
    };
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog()
            .file()
            .set_title("另存为")
            .set_file_name(&default_path)
            .add_filter("Markdown", &MD_EXTENSIONS)
            .blocking_save_file()
            .and_then(|fp| fp.into_path().ok())
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };
    let path_str = path.to_string_lossy().into_owned();
    state.grant_path(&path_str);
    std::fs::write(&path, payload.content.as_bytes()).map_err(|e| e.to_string())?;
    let name = file_name(&path_str);
    config::touch_recent_file(&state, &path_str, &name);
    Ok(Some(SavedAs { path: path_str, name }))
}

#[tauri::command]
pub fn file_recent_list(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let cfg = config::get_config(&state);
    let items = cfg
        .get("recentFiles")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    // 最近文件属已授权来源，允许后续直接读取
    for item in &items {
        if let Some(p) = item.get("path").and_then(Value::as_str) {
            state.grant_path(p);
        }
    }
    Ok(items)
}

#[tauri::command]
pub fn file_recent_clear(state: State<'_, AppState>) -> Result<OkResult, String> {
    config::clear_recent_files(&state);
    Ok(OkResult { ok: true })
}
