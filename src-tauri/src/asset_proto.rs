//! 本地文档图片协议：mdkit-doc://local/?p=<encodeURIComponent(绝对路径)>
//! 仅放行图片扩展名；路径必须位于「已打开文档所在目录」白名单之内，防目录穿越。
//! （对齐 asset-protocol.ts；Windows 下 WebView2 以 http://mdkit-doc.localhost/ 形式送达）

use std::path::Path;

use tauri::http::{Request, Response};
use tauri::{Manager, UriSchemeContext};

const IMAGE_EXTENSIONS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
];

fn content_type(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri().to_string();
    let respond = |status: u16, body: &'static str, mime: &str| -> Response<Vec<u8>> {
        Response::builder()
            .status(status)
            .header("Content-Type", mime)
            .header("Access-Control-Allow-Origin", "*")
            .body(body.as_bytes().to_vec())
            .unwrap_or_else(|_| Response::builder().status(500).body(Vec::new()).expect("静态响应"))
    };

    // 从 query 提取 p=<encoded path>（兼容 mdkit-doc:// 与 http://mdkit-doc.localhost/ 两种形态）
    let url = match tauri::Url::parse(&uri) {
        Ok(url) => url,
        Err(_) => return respond(400, "Bad request", "text/plain"),
    };
    let encoded = url
        .query_pairs()
        .find(|(k, _)| k == "p")
        .map(|(_, v)| v.into_owned());
    let Some(encoded) = encoded else {
        return respond(400, "Bad request", "text/plain");
    };

    let state = ctx.app_handle().state::<crate::state::AppState>();
    let file_path = encoded.replace('/', std::path::MAIN_SEPARATOR_STR);
    let ext = Path::new(&file_path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let ok_ext = IMAGE_EXTENSIONS.contains(&ext.as_str());
    let ok_dir = state.dir_allowed(&file_path);
    let is_absolute = Path::new(&file_path).is_absolute();
    let exists = Path::new(&file_path).is_file();
    if !is_absolute || !ok_ext || !ok_dir || !exists {
        return respond(403, "Not allowed", "text/plain");
    }

    match std::fs::read(&file_path) {
        Ok(bytes) => Response::builder()
            .status(200)
            .header("Content-Type", content_type(&ext))
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes)
            .unwrap_or_else(|_| respond(500, "Internal error", "text/plain")),
        Err(_) => respond(403, "Not allowed", "text/plain"),
    }
}
