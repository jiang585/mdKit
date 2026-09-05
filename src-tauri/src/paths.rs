//! 用户数据目录：沿用 Electron 版的 %APPDATA%/MD工具箱（userData），
//! 实现 config.json / drafts / themes / logs / secrets 的无缝衔接。

use std::path::PathBuf;

pub fn app_data_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(crate::constants::APP_NAME)
}

pub fn config_file() -> PathBuf {
    app_data_dir().join("config.json")
}

pub fn drafts_dir() -> PathBuf {
    app_data_dir().join("drafts")
}

pub fn themes_dir() -> PathBuf {
    app_data_dir().join("themes")
}

pub fn logs_dir() -> PathBuf {
    app_data_dir().join("logs")
}

/// Electron safeStorage 时代的旧密钥文件（DPAPI 加密），用于一次性迁移
pub fn legacy_secrets_file() -> PathBuf {
    app_data_dir().join("secrets.json")
}
