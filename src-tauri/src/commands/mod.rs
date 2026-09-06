//! 命令层：对应前端 27 个 invoke 通道（src/shared/ipc-contract.ts）。
//! 参数经 serde 强类型反序列化（第二道防线，第一道在前端 Zod）。

pub mod ai;
pub mod config_cmd;
pub mod draft;
pub mod export;
pub mod file;
pub mod misc;
pub mod theme;

use serde::Deserialize;

/// 通用打开结果 { path, name, content }
#[derive(Debug, Clone, Serialize)]
pub struct OpenedFile {
    pub path: String,
    pub name: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct PathReq {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveReq {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAsReq {
    pub default_name: String,
    pub content: String,
}

use serde::Serialize;
