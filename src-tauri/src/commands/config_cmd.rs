//! 配置命令：config:get / config:patch（patch 后按需重建菜单）。

use serde_json::Value;
use tauri::{AppHandle, State};

use crate::config;
use crate::menu;
use crate::state::AppState;

#[tauri::command]
pub fn config_get(state: State<'_, AppState>) -> Result<Value, String> {
    Ok(config::get_config(&state))
}

#[tauri::command]
pub fn config_patch(app: AppHandle, state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let next = config::patch_config(&state, &payload)?;
    // 主题/快捷键变化会影响菜单（radio 勾选与加速键）
    let affects_menu = payload.get("theme").is_some() || payload.get("shortcuts").is_some();
    if affects_menu {
        menu::rebuild_menu(&app);
    }
    Ok(next)
}
