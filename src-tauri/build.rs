use std::env;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    // GNU 工具链动态链接 WebView2Loader：把 DLL 复制到目标目录，确保 dev/build 产物可直接运行
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    if let Some(profile_dir) = out_dir.ancestors().nth(3) {
        let src = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("lib/WebView2Loader.dll");
        let dst = profile_dir.join("WebView2Loader.dll");
        if src.exists() && !dst.exists() {
            let _ = std::fs::copy(&src, &dst);
        }
    }
}
