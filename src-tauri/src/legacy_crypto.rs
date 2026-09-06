//! Electron safeStorage 旧密钥解密（Windows 实现）。
//! Electron ≥ 15 在 Windows 上采用 Chromium os_crypt 方案：
//!   密文 = base64( "v10" + nonce[12] + AES-256-GCM(明文) + tag[16] )
//!   AES 密钥 = base64( "DPAPI" + CryptProtectData(随机32字节密钥) )，存于
//!   userData/Local State 的 os_crypt.encrypted_key。

use base64::Engine;
use serde_json::Value;

use crate::paths;

/// 解密 Electron safeStorage 的 base64 密文（自动识别 v10 与裸 DPAPI 两种格式）
pub fn decrypt_safe_storage_b64(encoded: &str) -> Option<String> {
    let blob = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    if blob.starts_with(b"v10") {
        if blob.len() < 3 + 12 + 16 {
            return None;
        }
        let key = load_os_crypt_key()?;
        aes256_gcm_decrypt(&key, &blob[3..15], &blob[15..])
    } else {
        // 兜底：早期裸 DPAPI 格式
        let plain = dpapi_unprotect_bytes(&blob)?;
        String::from_utf8(plain).ok()
    }
}

/// 从 userData/Local State 读取 os_crypt 的 AES 密钥（DPAPI 解出 32 字节）
fn load_os_crypt_key() -> Option<Vec<u8>> {
    let path = paths::app_data_dir().join("Local State");
    let raw = std::fs::read_to_string(&path).ok()?;
    let parsed: Value = serde_json::from_str(&raw).ok()?;
    let encrypted = parsed.get("os_crypt")?.get("encrypted_key")?.as_str()?;
    let blob = base64::engine::general_purpose::STANDARD.decode(encrypted).ok()?;
    if !blob.starts_with(b"DPAPI") {
        return None;
    }
    let key = dpapi_unprotect_bytes(&blob[5..])?;
    if key.len() != 32 {
        return None;
    }
    Some(key)
}

fn aes256_gcm_decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Option<String> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    let plain = cipher.decrypt(Nonce::from_slice(nonce), ciphertext).ok()?;
    String::from_utf8(plain).ok()
}

/// DPAPI CurrentUser 解密（原始字节）
pub fn dpapi_unprotect_bytes(blob: &[u8]) -> Option<Vec<u8>> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::LocalFree;
        use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};
        if blob.is_empty() {
            return None;
        }
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: blob.len() as u32,
            pbData: blob.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        let result = unsafe { CryptUnprotectData(&input, None, None, None, None, 0, &mut output) };
        if result.is_err() || output.pbData.is_null() {
            return None;
        }
        let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
        let out = bytes.to_vec();
        unsafe {
            let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(output.pbData.cast())));
        }
        Some(out)
    }
    #[cfg(not(windows))]
    {
        None
    }
}
