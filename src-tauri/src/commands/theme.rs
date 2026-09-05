//! 自定义主题命令：导入 JSON 主题到 themes/、列出（对齐 theme-files.ts）。

use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::constants::MAX_THEME_BYTES;
use crate::fsx;
use crate::logger;
use crate::paths;

#[derive(Serialize)]
#[serde(untagged)]
pub enum ThemeImportResult {
    Success { json: String },
    Failure { error: String },
}

fn is_safe_theme_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    bytes.len() >= 2
        && bytes.len() <= 64
        && bytes[0].is_ascii_lowercase()
        && bytes.iter().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

#[tauri::command]
pub async fn theme_import(app: AppHandle) -> Result<Option<ThemeImportResult>, String> {
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog()
            .file()
            .set_title("导入主题（JSON）")
            .add_filter("主题文件", &["json"])
            .blocking_pick_file()
            .and_then(|fp| fp.into_path().ok())
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };

    let raw = match fsx::read_text_lossy(&path) {
        Ok(raw) => raw,
        Err(err) => {
            logger::error(&format!("导入主题失败：{err}"));
            return Ok(Some(ThemeImportResult::Failure { error: format!("主题文件解析失败：{err}") }));
        }
    };
    if raw.len() > MAX_THEME_BYTES {
        return Ok(Some(ThemeImportResult::Failure { error: "主题文件过大（>64KB）".into() }));
    }
    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(err) => {
            logger::error(&format!("导入主题失败：{err}"));
            return Ok(Some(ThemeImportResult::Failure { error: format!("主题文件解析失败：{err}") }));
        }
    };
    let Some(id) = parsed.get("id").and_then(serde_json::Value::as_str) else {
        return Ok(Some(ThemeImportResult::Failure { error: "主题 id 非法：需为小写字母/数字/连字符".into() }));
    };
    if !is_safe_theme_id(id) {
        return Ok(Some(ThemeImportResult::Failure { error: "主题 id 非法：需为小写字母/数字/连字符".into() }));
    }
    let dest = paths::themes_dir().join(format!("{id}.json"));
    if let Err(err) = std::fs::write(&dest, raw.as_bytes()) {
        return Ok(Some(ThemeImportResult::Failure { error: format!("主题写入失败：{err}") }));
    }
    Ok(Some(ThemeImportResult::Success { json: raw }))
}

#[tauri::command]
pub fn theme_list_custom() -> Result<Vec<String>, String> {
    let dir = paths::themes_dir();
    let _ = std::fs::create_dir_all(&dir);
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(out) };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |e| e != "json") {
            continue;
        }
        if let Ok(raw) = fsx::read_text_lossy(Path::new(&path)) {
            if raw.len() <= MAX_THEME_BYTES {
                out.push(raw);
            }
        }
    }
    Ok(out)
}
