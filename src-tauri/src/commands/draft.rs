//! 崩溃恢复草稿命令（对齐 drafts.ts）：tabId 为键写入 drafts/。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::paths;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DraftEntry {
    #[serde(rename = "tabId")]
    pub tab_id: String,
    pub path: Option<String>,
    pub content: String,
    #[serde(rename = "savedAt")]
    pub saved_at: f64,
}

#[derive(Serialize)]
pub struct OkResult {
    pub ok: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSaveReq {
    pub tab_id: String,
    pub path: Option<String>,
    pub content: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftClearReq {
    pub tab_id: String,
}

fn is_safe_id(tab_id: &str) -> bool {
    !tab_id.is_empty()
        && tab_id.len() <= 64
        && tab_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

#[tauri::command]
pub fn draft_save(state: State<'_, crate::state::AppState>, payload: DraftSaveReq) -> Result<OkResult, String> {
    if !is_safe_id(&payload.tab_id) {
        return Ok(OkResult { ok: true }); // 非法 id 静默忽略（对齐原实现）
    }
    let entry = DraftEntry {
        tab_id: payload.tab_id.clone(),
        path: payload.path,
        content: payload.content,
        saved_at: now_ms(),
    };
    let dir = paths::drafts_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{}.json", payload.tab_id));
    std::fs::write(&file, serde_json::to_string(&entry).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn draft_clear(state: State<'_, crate::state::AppState>, payload: DraftClearReq) -> Result<OkResult, String> {
    if !is_safe_id(&payload.tab_id) {
        return Ok(OkResult { ok: true });
    }
    let file = paths::drafts_dir().join(format!("{}.json", payload.tab_id));
    let _ = std::fs::remove_file(&file);
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn draft_list() -> Result<Vec<DraftEntry>, String> {
    let dir = paths::drafts_dir();
    let _ = std::fs::create_dir_all(&dir);
    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(vec![]) };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |e| e != "json") {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(entry) = serde_json::from_str::<DraftEntry>(&raw) {
                out.push(entry);
            }
        }
    }
    out.sort_by(|a, b| b.saved_at.partial_cmp(&a.saved_at).unwrap_or(std::cmp::Ordering::Equal));
    Ok(out)
}

fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}
