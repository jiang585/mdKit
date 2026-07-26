/** 跨进程共享常量（shared 只被单向依赖，不引用任何模块私有代码） */

export const APP_NAME = 'MD工具箱';

/** 渲染防抖初始值（架构决策输入 §9），可依性能测试调整，总延迟 ≤ MAX_RENDER_DELAY_MS */
export const RENDER_DEBOUNCE_MS = 120;
/** 编辑到预览的最大允许延迟（需求 F3.1） */
export const MAX_RENDER_DELAY_MS = 300;

/** 自动保存默认间隔（F1.8，可配置） */
export const AUTOSAVE_DEFAULT_INTERVAL_MS = 30_000;
export const AUTOSAVE_MIN_INTERVAL_MS = 5_000;

/** 最近文件列表上限（F1.5） */
export const RECENT_FILES_MAX = 10;

/** 分屏比例上下限（F5.4） */
export const SPLIT_RATIO_MIN = 0.2;
export const SPLIT_RATIO_MAX = 0.8;

/** 最小窗口尺寸（阶段5 响应式约束） */
export const MIN_WINDOW_WIDTH = 720;
export const MIN_WINDOW_HEIGHT = 480;

/** 本地文档资源自定义协议（预览区本地图片） */
export const DOC_ASSET_PROTOCOL = 'mdkit-doc';

/** 内置主题 ID */
export const BUILTIN_THEME_IDS = ['light-default', 'light-sepia', 'dark-default', 'dark-ocean'] as const;
export const DEFAULT_LIGHT_THEME = 'light-default';
export const DEFAULT_DARK_THEME = 'dark-default';
/** 主题加载失败时的兜底主题（需求 §6 错误处理） */
export const FALLBACK_THEME_ID = DEFAULT_LIGHT_THEME;

/** 允许在预览/导出中打开的外部链接协议白名单 */
export const SAFE_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

/** AI 请求默认超时 */
export const AI_REQUEST_TIMEOUT_MS = 120_000;
