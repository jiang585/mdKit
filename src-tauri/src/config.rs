//! 用户配置存储：userData/config.json（原子写 + 损坏回退 .bak）。
//! 前端保留 Zod schema（ipc 契约），Rust 侧按同一 Schema 语义做 defaults 填充与校验，
//! 行为对齐原 config-store.ts + mergeConfig + userConfigSchema。

use std::fs;

use serde_json::{json, Map, Value};

use crate::constants::*;
use crate::fsx;
use crate::logger;
use crate::paths;
use crate::state::AppState;

/* ---------- 默认值（镜像 userConfigSchema 的 .default()） ---------- */

fn default_config() -> Value {
    json!({
        "version": 1,
        "theme": {
            "linked": true,
            "editorThemeId": "light-default",
            "previewThemeId": "light-default"
        },
        "layout": {
            "mode": "split",
            "ratio": 0.5,
            "tocVisible": false,
            "aiPanelVisible": false
        },
        "autosave": {
            "enabled": true,
            "intervalMs": AUTOSAVE_DEFAULT_INTERVAL_MS
        },
        "editor": {
            "fontSize": 14,
            "lineNumbers": true,
            "wordWrap": true
        },
        "shortcuts": {},
        "recentFiles": [],
        "ai": {
            "activeProfileId": null,
            "profiles": []
        }
    })
}

/* ---------- 校验（镜像 Zod 的拒绝语义：非法即 Err） ---------- */

fn as_bool(v: &Value, ctx: &str) -> Result<bool, String> {
    v.as_bool().ok_or_else(|| format!("{ctx}: 应为布尔值"))
}

fn as_string(v: &Value, ctx: &str) -> Result<String, String> {
    v.as_str().map(str::to_string).ok_or_else(|| format!("{ctx}: 应为字符串"))
}

fn as_int(v: &Value, ctx: &str) -> Result<i64, String> {
    v.as_i64().ok_or_else(|| format!("{ctx}: 应为整数"))
}

fn validate_theme(v: &Value) -> Result<Value, String> {
    let obj = v.as_object().ok_or("theme: 应为对象")?;
    Ok(json!({
        "linked": obj.get("linked").map_or(Ok(true), |x| as_bool(x, "theme.linked"))?,
        "editorThemeId": obj.get("editorThemeId").map_or(Ok("light-default".to_string()), |x| as_string(x, "theme.editorThemeId"))?,
        "previewThemeId": obj.get("previewThemeId").map_or(Ok("light-default".to_string()), |x| as_string(x, "theme.previewThemeId"))?,
    }))
}

fn validate_layout(v: &Value) -> Result<Value, String> {
    let obj = v.as_object().ok_or("layout: 应为对象")?;
    let mode = match obj.get("mode") {
        None | Some(Value::Null) => "split".to_string(),
        Some(x) => {
            let m = as_string(x, "layout.mode")?;
            if ["split", "editor", "preview"].contains(&m.as_str()) {
                m
            } else {
                return Err("layout.mode: 非法枚举".into());
            }
        }
    };
    let ratio = match obj.get("ratio") {
        None | Some(Value::Null) => 0.5,
        Some(x) => {
            let r = x.as_f64().ok_or("layout.ratio: 应为数字")?;
            if !(SPLIT_RATIO_MIN..=SPLIT_RATIO_MAX).contains(&r) {
                return Err(format!("layout.ratio: 应在 {SPLIT_RATIO_MIN}~{SPLIT_RATIO_MAX}"));
            }
            r
        }
    };
    Ok(json!({
        "mode": mode,
        "ratio": ratio,
        "tocVisible": obj.get("tocVisible").map_or(Ok(false), |x| as_bool(x, "layout.tocVisible"))?,
        "aiPanelVisible": obj.get("aiPanelVisible").map_or(Ok(false), |x| as_bool(x, "layout.aiPanelVisible"))?,
    }))
}

fn validate_autosave(v: &Value) -> Result<Value, String> {
    let obj = v.as_object().ok_or("autosave: 应为对象")?;
    let interval = match obj.get("intervalMs") {
        None | Some(Value::Null) => AUTOSAVE_DEFAULT_INTERVAL_MS,
        Some(x) => {
            let i = as_int(x, "autosave.intervalMs")?;
            if i < AUTOSAVE_MIN_INTERVAL_MS {
                return Err(format!("autosave.intervalMs: 不得小于 {AUTOSAVE_MIN_INTERVAL_MS}"));
            }
            i
        }
    };
    Ok(json!({
        "enabled": obj.get("enabled").map_or(Ok(true), |x| as_bool(x, "autosave.enabled"))?,
        "intervalMs": interval,
    }))
}

fn validate_editor(v: &Value) -> Result<Value, String> {
    let obj = v.as_object().ok_or("editor: 应为对象")?;
    let size = match obj.get("fontSize") {
        None | Some(Value::Null) => 14,
        Some(x) => {
            let i = as_int(x, "editor.fontSize")?;
            if !(EDITOR_FONT_SIZE_MIN..=EDITOR_FONT_SIZE_MAX).contains(&i) {
                return Err(format!("editor.fontSize: 应在 {EDITOR_FONT_SIZE_MIN}~{EDITOR_FONT_SIZE_MAX}"));
            }
            i
        }
    };
    Ok(json!({
        "fontSize": size,
        "lineNumbers": obj.get("lineNumbers").map_or(Ok(true), |x| as_bool(x, "editor.lineNumbers"))?,
        "wordWrap": obj.get("wordWrap").map_or(Ok(true), |x| as_bool(x, "editor.wordWrap"))?,
    }))
}

fn validate_shortcuts(v: &Value) -> Result<Value, String> {
    let obj = v.as_object().ok_or("shortcuts: 应为对象")?;
    let mut out = Map::new();
    for (k, val) in obj {
        out.insert(k.clone(), Value::String(as_string(val, "shortcuts.*")?));
    }
    Ok(Value::Object(out))
}

fn validate_recent(v: &Value) -> Result<Value, String> {
    let arr = v.as_array().ok_or("recentFiles: 应为数组")?;
    let mut out = Vec::new();
    for item in arr {
        let obj = item.as_object().ok_or("recentFiles[]: 应为对象")?;
        out.push(json!({
            "path": as_string(obj.get("path").ok_or("recentFiles.path: 缺失")?, "recentFiles.path")?,
            "name": as_string(obj.get("name").ok_or("recentFiles.name: 缺失")?, "recentFiles.name")?,
            "lastOpenedAt": obj.get("lastOpenedAt").and_then(Value::as_f64).unwrap_or(0.0),
        }));
    }
    Ok(Value::Array(out))
}

fn validate_profiles(v: &Value) -> Result<Value, String> {
    let arr = v.as_array().ok_or("ai.profiles: 应为数组")?;
    let mut out = Vec::new();
    for item in arr {
        let obj = item.as_object().ok_or("ai.profiles[]: 应为对象")?;
        let base_url = as_string(obj.get("baseUrl").ok_or("ai.profiles.baseUrl: 缺失")?, "ai.profiles.baseUrl")?;
        if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
            return Err("ai.profiles.baseUrl: 应为合法 URL".into());
        }
        out.push(json!({
            "id": as_string(obj.get("id").ok_or("ai.profiles.id: 缺失")?, "ai.profiles.id")?,
            "name": as_string(obj.get("name").ok_or("ai.profiles.name: 缺失")?, "ai.profiles.name")?,
            "baseUrl": base_url,
            "model": as_string(obj.get("model").ok_or("ai.profiles.model: 缺失")?, "ai.profiles.model")?,
            "scene": obj.get("scene").map_or(Ok("通用".to_string()), |x| as_string(x, "ai.profiles.scene"))?,
            "redact": obj.get("redact").map_or(Ok(false), |x| as_bool(x, "ai.profiles.redact"))?,
            "previewRequests": obj.get("previewRequests").map_or(Ok(false), |x| as_bool(x, "ai.profiles.previewRequests"))?,
        }));
    }
    Ok(Value::Array(out))
}

fn validate_ai(v: &Value) -> Result<Value, String> {
    let obj = v.as_object().ok_or("ai: 应为对象")?;
    Ok(json!({
        "activeProfileId": match obj.get("activeProfileId") {
            None | Some(Value::Null) => Value::Null,
            Some(x) => Value::String(as_string(x, "ai.activeProfileId")?),
        },
        "profiles": match obj.get("profiles") {
            None | Some(Value::Null) => Value::Array(vec![]),
            Some(x) => validate_profiles(x)?,
        },
    }))
}

/// 归一化：缺省字段填默认值（镜像 Zod .default()），非法字段拒绝。
/// Zod 对未知键默认剥离，这里同样只保留已知键。
pub fn normalize_config(input: &Value) -> Result<Value, String> {
    let obj = input.as_object().ok_or("config: 应为对象")?;
    let version: i64 = match obj.get("version") {
        None | Some(Value::Null) => 1,
        Some(x) => {
            let v = as_int(x, "version")?;
            if v != 1 {
                return Err("version: 仅支持 1".into());
            }
            v
        }
    };
    Ok(json!({
        "version": version,
        "theme": match obj.get("theme") { None | Some(Value::Null) => validate_theme(&json!({}))?, Some(x) => validate_theme(x)? },
        "layout": match obj.get("layout") { None | Some(Value::Null) => validate_layout(&json!({}))?, Some(x) => validate_layout(x)? },
        "autosave": match obj.get("autosave") { None | Some(Value::Null) => validate_autosave(&json!({}))?, Some(x) => validate_autosave(x)? },
        "editor": match obj.get("editor") { None | Some(Value::Null) => validate_editor(&json!({}))?, Some(x) => validate_editor(x)? },
        "shortcuts": match obj.get("shortcuts") { None | Some(Value::Null) => validate_shortcuts(&json!({}))?, Some(x) => validate_shortcuts(x)? },
        "recentFiles": match obj.get("recentFiles") { None | Some(Value::Null) => Value::Array(vec![]), Some(x) => validate_recent(x)? },
        "ai": match obj.get("ai") { None | Some(Value::Null) => validate_ai(&json!({}))?, Some(x) => validate_ai(x)? },
    }))
}

/* ---------- mergeConfig 语义（仅一层嵌套合并；数组与标量整体替换） ---------- */

fn merge_config(base: &Value, patch: &Value) -> Value {
    let mut merged = base.clone();
    if let (Some(bmap), Some(pmap)) = (base.as_object(), patch.as_object()) {
        for (key, value) in pmap {
            if let Value::Object(patch_obj) = value {
                if let Some(base_obj) = bmap.get(key).and_then(Value::as_object) {
                    let mut merged_obj = base_obj.clone();
                    for (k2, v2) in patch_obj {
                        merged_obj.insert(k2.clone(), v2.clone());
                    }
                    merged[key] = Value::Object(merged_obj);
                    continue;
                }
            }
            merged[key] = value.clone();
        }
    }
    merged
}

/* ---------- 存取 ---------- */

pub fn get_config(state: &AppState) -> Value {
    {
        let cache = state.config_cache.lock().expect("config_cache");
        if let Some(cfg) = cache.as_ref() {
            return cfg.clone();
        }
    }
    let file = paths::config_file();
    if file.exists() {
        match fs::read_to_string(&file)
            .map_err(|e| e.to_string())
            .and_then(|raw| serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string()))
            .and_then(|v| normalize_config(&v))
        {
            Ok(cfg) => {
                *state.config_cache.lock().expect("config_cache") = Some(cfg.clone());
                return cfg;
            }
            Err(err) => {
                logger::error(&format!("配置文件损坏，回退默认配置：{err}"));
                let _ = fs::rename(&file, file.with_extension("json.bak"));
            }
        }
    }
    let cfg = default_config();
    *state.config_cache.lock().expect("config_cache") = Some(cfg.clone());
    cfg
}

pub fn patch_config(state: &AppState, patch: &Value) -> Result<Value, String> {
    let base = get_config(state);
    let next = normalize_config(&merge_config(&base, patch))?;
    *state.config_cache.lock().expect("config_cache") = Some(next.clone());
    if let Err(err) = fsx::atomic_write(&paths::config_file(), &serde_json::to_string_pretty(&next).unwrap_or_default()) {
        logger::error(&format!("配置写入失败：{err}"));
    }
    Ok(next)
}

/// 打开/保存文档时更新最近文件（F1.5，最多 10 条）
pub fn touch_recent_file(state: &AppState, path: &str, name: &str) {
    let cfg = get_config(state);
    let mut rest: Vec<Value> = cfg["recentFiles"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|f| f.get("path").and_then(Value::as_str) != Some(path))
        .collect();
    rest.insert(
        0,
        json!({ "path": path, "name": name, "lastOpenedAt": now_ms() }),
    );
    rest.truncate(RECENT_FILES_MAX);
    let _ = patch_config(state, &json!({ "recentFiles": rest }));
}

pub fn clear_recent_files(state: &AppState) -> Value {
    patch_config(state, &json!({ "recentFiles": [] })).unwrap_or_else(|_| get_config(state))
}

fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}
