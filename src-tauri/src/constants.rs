//! 跨进程共享常量（与前端 src/shared/constants.ts 保持一致，注释锁定命名）。

pub const APP_NAME: &str = "MD工具箱";

/// 最近文件列表上限（F1.5）
pub const RECENT_FILES_MAX: usize = 10;

/// 自动保存默认间隔（F1.8，可配置）；最小间隔
pub const AUTOSAVE_DEFAULT_INTERVAL_MS: i64 = 30_000;
pub const AUTOSAVE_MIN_INTERVAL_MS: i64 = 5_000;

/// 分屏比例上下限（F5.4）
pub const SPLIT_RATIO_MIN: f64 = 0.2;
pub const SPLIT_RATIO_MAX: f64 = 0.8;

/// 编辑器字号上下限
pub const EDITOR_FONT_SIZE_MIN: i64 = 10;
pub const EDITOR_FONT_SIZE_MAX: i64 = 32;

/// 允许在预览/导出中打开的外部链接协议白名单
pub const SAFE_LINK_PROTOCOLS: [&str; 3] = ["http", "https", "mailto"];

/// 本地文档资源自定义协议（预览区本地图片）
pub const DOC_ASSET_PROTOCOL: &str = "mdkit-doc";

/// AI 请求默认超时（与前端 AI_REQUEST_TIMEOUT_MS 一致）
pub const AI_REQUEST_TIMEOUT_MS: u64 = 120_000;

/// 自定义主题文件大小上限
pub const MAX_THEME_BYTES: usize = 64 * 1024;

/// 内置主题 ID（菜单 radio 勾选用）
pub const BUILTIN_THEME_IDS: [&str; 4] = [
    "light-default",
    "light-sepia",
    "dark-default",
    "dark-ocean",
];
