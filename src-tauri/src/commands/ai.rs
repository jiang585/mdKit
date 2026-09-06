//! AI 桥接命令：OpenAI 兼容协议流式代理 + 取消 + 密钥安全存储（对齐 ai-service.ts）。
//! - 渲染进程 CSP 禁任意外联，AI 请求统一经 Rust 代理；
//! - 密钥存 Windows 凭据管理器（keyring），绝不写日志/普通配置；
//! - Electron 版 safeStorage(DPAPI) 时代的 secrets.json 会被一次性迁移进 keyring。

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config;
use crate::constants::AI_REQUEST_TIMEOUT_MS;
use crate::logger;
use crate::paths;
use crate::state::{AiState, AppState};

const KEYRING_SERVICE: &str = "md-toolbox";

/* ---------- 请求载荷 ---------- */

#[derive(Debug, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatStartReq {
    pub request_id: String,
    pub profile_id: String,
    pub messages: Vec<AiMessage>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCancelReq {
    pub request_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSetReq {
    pub profile_id: String,
    pub api_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileIdReq {
    pub profile_id: String,
}

/* ---------- 密钥存储（keyring + 旧版 DPAPI 迁移） ---------- */

fn keyring_entry(profile_id: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, profile_id).ok()
}

fn get_key(profile_id: &str) -> Option<String> {
    if let Some(entry) = keyring_entry(profile_id) {
        if let Ok(key) = entry.get_password() {
            return Some(key);
        }
    }
    migrate_legacy_key(profile_id)
}

/// Electron safeStorage 旧密钥迁移：解密 secrets.json 中的 base64 blob → 存入 keyring。
fn migrate_legacy_key(profile_id: &str) -> Option<String> {
    let file = paths::legacy_secrets_file();
    let raw = std::fs::read_to_string(&file).ok()?;
    let secrets: Value = serde_json::from_str(&raw).ok()?;
    let enc = secrets.get(profile_id)?.as_str()?;
    let Some(plain) = crate::legacy_crypto::decrypt_safe_storage_b64(enc) else {
        logger::error("旧密钥解密失败（v10/DPAPI），请在设置中重新输入密钥");
        return None;
    };
    if let Some(entry) = keyring_entry(profile_id) {
        if entry.set_password(&plain).is_ok() {
            // 全部条目迁移完成后归档旧文件
            let all_migrated = secrets.as_object().map_or(true, |map| {
                map.keys().all(|id| {
                    keyring_entry(id).map_or(false, |e| e.get_password().is_ok())
                })
            });
            if all_migrated {
                let _ = std::fs::rename(&file, file.with_extension("json.migrated"));
            }
            logger::info("已迁移 Electron 时代加密密钥至系统凭据管理器");
            return Some(plain);
        }
    }
    None
}


/* ---------- 密钥命令 ---------- */

#[tauri::command]
pub fn ai_secret_set(payload: SecretSetReq) -> Result<Value, String> {
    let Some(entry) = keyring_entry(&payload.profile_id) else {
        return Ok(json!({ "ok": false, "message": "当前系统不可用安全凭据存储，已拒绝保存密钥" }));
    };
    let result = if payload.api_key.is_empty() {
        entry.delete_credential().map_or(Ok(()), |_| Ok(()))
    } else {
        entry.set_password(&payload.api_key).map_err(|e| e.to_string())
    };
    match result {
        Ok(()) => Ok(json!({ "ok": true })),
        Err(err) => {
            logger::error(&format!("密钥保存失败：{err}"));
            Ok(json!({ "ok": false, "message": format!("密钥保存失败：{err}") }))
        }
    }
}

#[tauri::command]
pub fn ai_secret_status(payload: ProfileIdReq) -> Result<Value, String> {
    Ok(json!({ "hasKey": get_key(&payload.profile_id).is_some() }))
}

/* ---------- 流式对话 ---------- */

#[tauri::command]
pub fn ai_chat_start(
    app: AppHandle,
    state: State<'_, AiState>,
    cfg_state: State<'_, AppState>,
    payload: AiChatStartReq,
) -> Result<Value, String> {
    let cfg = config::get_config(&cfg_state);
    let profile = cfg["ai"]["profiles"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|p| p.get("id").and_then(Value::as_str) == Some(payload.profile_id.as_str()))
                .cloned()
        });
    let Some(profile) = profile else {
        return Ok(json!({ "ok": false, "message": "未找到 AI 配置" }));
    };
    let Some(key) = get_key(&payload.profile_id) else {
        return Ok(json!({ "ok": false, "message": "该配置尚未设置 API 密钥" }));
    };
    let base_url = profile.get("baseUrl").and_then(Value::as_str).unwrap_or_default().to_string();
    let model = profile.get("model").and_then(Value::as_str).unwrap_or_default().to_string();

    let request_id = payload.request_id.clone();
    let app_task = app.clone();
    let request_id_task = request_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        run_chat(
            app_task.clone(),
            request_id_task.clone(),
            base_url,
            model,
            key,
            payload.messages,
            payload.temperature,
            payload.max_tokens,
        )
        .await;
        // 任务结束（完成/失败）后清理 in-flight 句柄
        app_task
            .state::<AiState>()
            .inflight
            .lock()
            .ok()
            .map(|mut map| map.remove(&request_id_task));
    });
    state.inflight.lock().map_err(|_| "状态锁不可用")?.insert(request_id.clone(), handle);
    Ok(json!({ "ok": true }))
}

async fn run_chat(
    app: AppHandle,
    request_id: String,
    base_url: String,
    model: String,
    key: String,
    messages: Vec<AiMessage>,
    temperature: Option<f64>,
    max_tokens: Option<i64>,
) {
    let emit_error = |message: String| {
        let _ = app.emit("ai:chat-error", json!({ "requestId": request_id, "message": message }));
    };
    let emit_chunk = |delta: &str| {
        let _ = app.emit("ai:chat-chunk", json!({ "requestId": request_id, "delta": delta }));
    };
    let emit_done = |finish_reason: Option<String>| {
        let _ = app.emit("ai:chat-done", json!({ "requestId": request_id, "finishReason": finish_reason }));
    };

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut body = json!({
        "model": model,
        "stream": true,
        "messages": messages
            .iter()
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect::<Vec<_>>(),
    });
    if let Some(t) = temperature {
        body["temperature"] = json!(t);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = json!(mt);
    }

    let client = reqwest::Client::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(AI_REQUEST_TIMEOUT_MS);
    let request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {key}"))
        .json(&body);

    let response = match tokio::time::timeout_at(deadline, request.send()).await {
        Err(_) => {
            // 总超时触发中止（对齐 Electron：abort 后错误消息为「请求已取消」）
            emit_error("请求已取消".into());
            return;
        }
        Ok(Err(err)) => {
            emit_error(format!("请求失败：{err}"));
            logger::error(&format!("AI 请求失败：{err}"));
            return;
        }
        Ok(Ok(resp)) => resp,
    };

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        let preview: String = text.chars().take(300).collect();
        emit_error(format!("后端返回 {status}：{preview}"));
        return;
    }

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut finish_reason: Option<String> = None;

    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => {
                emit_error("请求已取消".into());
                return;
            }
            item = stream.next() => match item {
                None => break,
                Some(Err(err)) => {
                    emit_error(format!("请求失败：{err}"));
                    return;
                }
                Some(Ok(bytes)) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(idx) = buffer.find('\n') {
                        let line = buffer[..idx].trim().to_string();
                        buffer.drain(..idx + 1);
                        if !line.starts_with("data:") {
                            continue;
                        }
                        let data = line[5..].trim().to_string();
                        if data == "[DONE]" {
                            continue;
                        }
                        let Ok(parsed) = serde_json::from_str::<Value>(&data) else {
                            continue; // 忽略无法解析的心跳/注释行
                        };
                        let choice = &parsed["choices"][0];
                        if let Some(delta) = choice["delta"]["content"].as_str() {
                            if !delta.is_empty() {
                                emit_chunk(delta);
                            }
                        }
                        if let Some(reason) = choice["finish_reason"].as_str() {
                            finish_reason = Some(reason.to_string());
                        }
                    }
                }
            }
        }
    }
    emit_done(finish_reason);
}

#[tauri::command]
pub fn ai_chat_cancel(
    app: AppHandle,
    state: State<'_, AiState>,
    payload: AiCancelReq,
) -> Result<Value, String> {
    let handle = state
        .inflight
        .lock()
        .map_err(|_| "状态锁不可用")?
        .remove(&payload.request_id);
    if let Some(handle) = handle {
        // 对齐 Electron：取消后向渲染进程推送「请求已取消」错误事件
        let _ = app.emit(
            "ai:chat-error",
            json!({ "requestId": payload.request_id, "message": "请求已取消" }),
        );
        handle.abort();
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn ai_test_connection(cfg_state: State<'_, AppState>, payload: ProfileIdReq) -> Result<Value, String> {
    let cfg = config::get_config(&cfg_state);
    let profile = cfg["ai"]["profiles"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|p| p.get("id").and_then(Value::as_str) == Some(payload.profile_id.as_str()))
                .cloned()
        });
    let Some(profile) = profile else {
        return Ok(json!({ "ok": false, "message": "未找到 AI 配置" }));
    };
    let Some(key) = get_key(&payload.profile_id) else {
        return Ok(json!({ "ok": false, "message": "尚未设置 API 密钥" }));
    };
    let base_url = profile.get("baseUrl").and_then(Value::as_str).unwrap_or_default();
    let url = format!("{}/models", base_url.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let request = client.get(&url).header("Authorization", format!("Bearer {key}"));
    match tokio::time::timeout(std::time::Duration::from_secs(10), request.send()).await {
        Err(_) => Ok(json!({ "ok": false, "message": "连接失败：请求超时" })),
        Ok(Err(err)) => Ok(json!({ "ok": false, "message": format!("连接失败：{err}") })),
        Ok(Ok(resp)) => {
            if resp.status().is_success() {
                Ok(json!({ "ok": true, "message": "连接成功" }))
            } else {
                Ok(json!({ "ok": false, "message": format!("连接失败：HTTP {}", resp.status().as_u16()) }))
            }
        }
    }
}
