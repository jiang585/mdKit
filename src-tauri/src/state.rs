//! 应用运行态：授权路径集合、文档目录白名单、配置缓存、AI in-flight 任务。

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use serde_json::Value;
use tauri::async_runtime::JoinHandle;

#[derive(Default)]
pub struct AppState {
    /// 已授权路径集合：对话框/拖拽/最近文件/命令行来源的路径才允许后续读写
    pub granted_paths: Mutex<HashSet<String>>,
    /// 已打开文档所在目录白名单（本地图片协议防目录穿越）
    pub allowed_dirs: Mutex<HashSet<String>>,
    /// 配置缓存（normalized 全量 JSON）
    pub config_cache: Mutex<Option<Value>>,
}

impl AppState {
    pub fn grant_path(&self, path: &str) {
        self.granted_paths.lock().expect("granted_paths").insert(path.to_string());
    }

    pub fn assert_granted(&self, path: &str) -> Result<(), String> {
        if self.granted_paths.lock().expect("granted_paths").contains(path) {
            Ok(())
        } else {
            Err("路径未经授权".into())
        }
    }

    /// 目录白名单：规范化为带分隔符前缀形式（与 Electron asset-protocol 一致）
    pub fn allow_doc_dir(&self, dir: &str) {
        let normalized = dir.trim_end_matches(['\\', '/']).to_string() + std::path::MAIN_SEPARATOR_STR;
        self.allowed_dirs.lock().expect("allowed_dirs").insert(normalized);
    }

    pub fn dir_allowed(&self, file_path: &str) -> bool {
        let dirs = self.allowed_dirs.lock().expect("allowed_dirs");
        dirs.iter().any(|d| file_path.starts_with(d.as_str()))
    }
}

#[derive(Default)]
pub struct AiState {
    /// requestId → 流式任务句柄（abort = 取消）
    pub inflight: Mutex<HashMap<String, JoinHandle<()>>>,
}
