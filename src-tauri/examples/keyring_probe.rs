//! 无头探针：keyring 可用性 + Electron 旧密钥解密验证（不输出明文）
use keyring::Entry;

fn main() {
    println!("--- keyring 基础能力 ---");
    let entry = Entry::new("md-toolbox", "probe-test").expect("Entry::new 失败");
    println!("set:  {:?}", entry.set_password("test-key-123").is_ok());
    println!("get:  {:?}", entry.get_password().as_deref());
    println!("del:  {:?}", entry.delete_credential().is_ok());

    println!("--- Electron 旧密钥解密（secrets.json + Local State）---");
    let file = std::path::Path::new(&std::env::var("APPDATA").unwrap())
        .join("MD工具箱")
        .join("secrets.json");
    let raw = std::fs::read_to_string(&file).expect("读取 secrets.json 失败");
    let secrets: serde_json::Value = serde_json::from_str(&raw).unwrap();
    for (id, enc) in secrets.as_object().unwrap() {
        match md_toolbox_lib::legacy_crypto::decrypt_safe_storage_b64(enc.as_str().unwrap()) {
            Some(plain) => println!("profile {id}: 解密成功 len={} prefix={:?}（已验证可迁移）", plain.len(), &plain[..3.min(plain.len())]),
            None => println!("profile {id}: 解密失败"),
        }
    }
}
