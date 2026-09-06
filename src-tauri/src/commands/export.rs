//! 导出命令：HTML 落盘 + PDF（静默，经独立 WebView2 打印环境）。
//! 输入是渲染管线已确认的文档快照 HTML（对齐 export-service.ts）。

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::logger;
use crate::pdf;
use crate::state::AppState;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReq {
    pub default_name: String,
    pub html: String,
}

#[derive(Serialize)]
pub struct Exported {
    pub path: String,
}

fn blocking_pick_save(
    app: &AppHandle,
    title: &str,
    default_name: &str,
    filter_name: &str,
    ext: &str,
) -> Option<PathBuf> {
    app.dialog()
        .file()
        .set_title(title)
        .set_file_name(default_name)
        .add_filter(filter_name, &[ext])
        .blocking_save_file()
        .and_then(|fp| fp.into_path().ok())
}

#[tauri::command]
pub async fn export_html(app: AppHandle, payload: ExportReq) -> Result<Option<Exported>, String> {
    let base = payload.default_name.trim_end_matches(".md").trim_end_matches(".MD").to_string();
    let suggested = format!("{}.html", if base.is_empty() { "未命名" } else { &base });
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        blocking_pick_save(&app2, "导出 HTML", &suggested, "HTML 文件", "html")
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };
    std::fs::write(&path, payload.html.as_bytes()).map_err(|e| e.to_string())?;
    logger::info("已导出 HTML");
    Ok(Some(Exported { path: path.to_string_lossy().into_owned() }))
}

#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: ExportReq,
) -> Result<Option<Exported>, String> {
    let base = payload.default_name.trim_end_matches(".md").trim_end_matches(".MD").to_string();
    let suggested = format!("{}.pdf", if base.is_empty() { "未命名" } else { &base });
    let app2 = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        blocking_pick_save(&app2, "导出 PDF", &suggested, "PDF 文件", "pdf")
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };
    let path_str = path.to_string_lossy().into_owned();

    // 大文档经临时文件加载，避免超长 data: URL（对齐原实现）
    let html = payload.html;
    let out = path_str.clone();
    state.grant_path(&path_str);
    let result = tauri::async_runtime::spawn_blocking(move || pdf::print_to_pdf(&html, std::path::Path::new(&out)))
        .await
        .map_err(|e| e.to_string())?;
    match result {
        Ok(()) => {
            logger::info("已导出 PDF");
            Ok(Some(Exported { path: path_str }))
        }
        Err(err) => {
            logger::error(&format!("PDF 导出失败：{err}"));
            Err(err)
        }
    }
}
