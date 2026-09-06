//! 文件日志：userData/logs/mdkit.log，1MB 轮转一份。
//! 红线（架构决策输入 §4）：不记录 API 密钥、文档正文、完整用户文件路径。

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use regex::Regex;

use crate::paths;

const MAX_LOG_BYTES: u64 = 1024 * 1024;

fn log_file() -> PathBuf {
    let dir = paths::logs_dir();
    let _ = fs::create_dir_all(&dir);
    dir.join("mdkit.log")
}

/// 将潜在敏感串脱敏：密钥形态、绝对路径只留文件名（与 Electron 版 logger.redactForLog 语义一致）
pub fn redact_for_log(input: &str) -> String {
    let key_re = Regex::new(r"(sk-|key-|Bearer\s+)[A-Za-z0-9_-]{8,}").expect("static regex");
    let path_re = Regex::new(r#"(?:[A-Za-z]:\\|/)[^\s'"]{4,}"#).expect("static regex");
    let after_keys = key_re.replace_all(input, "${1}***");
    path_re
        .replace_all(&after_keys, |caps: &regex::Captures| {
            let m = caps.get(0).map_or("", |m| m.as_str());
            let name = m.rsplit(['\\', '/']).next().unwrap_or(m);
            format!("…{name}")
        })
        .into_owned()
}

fn write(level: &str, msg: &str) {
    let file = log_file();
    if let Ok(meta) = fs::metadata(&file) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = fs::rename(&file, file.with_extension("log.1"));
        }
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&file) {
        let _ = writeln!(f, "{} [{}] {}", iso_now(), level, redact_for_log(msg));
    }
}

fn iso_now() -> String {
    // 无 chrono 依赖：用系统时间拼 UTC 时间戳（精确到秒，日志用途足够）
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // civil_from_days（Howard Hinnant 算法）
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    format!("{year:04}-{month:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

pub fn info(msg: &str) {
    write("INFO", msg);
}

pub fn warn(msg: &str) {
    write("WARN", msg);
}

pub fn error(msg: &str) {
    write("ERROR", msg);
}
