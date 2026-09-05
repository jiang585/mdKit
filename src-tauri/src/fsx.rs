//! 文件系统公共工具：原子写、UTF-8 容错读取。

use std::fs;
use std::io::Write;
use std::path::Path;

/// 原子写（tmp + rename，Windows rename 自带 REPLACE_EXISTING）
pub fn atomic_write(file: &Path, data: &str) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir)?;
        }
    }
    let tmp = file.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data.as_bytes())?;
        f.flush()?;
    }
    fs::rename(&tmp, file)
}

/// 以 UTF-8 容错方式读文本（与 Node readFile('utf-8') 的 U+FFFD 替换语义一致）
pub fn read_text_lossy(path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
