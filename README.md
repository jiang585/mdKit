<div align="center">

# MD工具箱（mdKit · Tauri 2 轻量版）

**与 Electron 版功能一致的极度轻量化重构 —— 安装包 ~4.5MB，便携版 ~5MB**

基于 Tauri 2 + React 18 + CodeMirror 6 + unified 构建，为开发者、技术写作者与知识管理用户提供「所见即所得」的实时编辑体验。

![版本](https://img.shields.io/badge/version-1.0.0-2ea44f?style=flat-square)
![平台](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078d6?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square)
![体积](https://img.shields.io/badge/安装包-4.5MB-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-MIT%20(商用需授权)-orange?style=flat-square)

</div>

---

## 📦 与 Electron 版的对比

| 指标 | Electron 版 | Tauri 2 版（本项目） |
|------|------------|---------------------|
| 安装包体积 | ~92 MB | **~4.5 MB**（-95%） |
| 便携版 | ~92 MB 单文件 | **~5 MB zip** |
| 渲染内核 | 打包 Chromium | 系统 WebView2（Edge 内核） |
| 内存占用 | 高 | 显著降低 |
| 前端代码 | — | 与 Electron 版 1:1 复用 |

**新增强**：AI 助手回复现已支持 **Markdown 渲染**（GFM 表格、KaTeX 公式、代码高亮，流式增量渲染，经与预览区同一套 XSS 消毒白名单）。

---

## ✨ 功能特性（与原版一致）

- **编辑**：CodeMirror 6 内核、多标签页（撤销栈/选区/滚动完整保留）、完整快捷键、Markdown 快捷命令
- **预览**：GFM 全支持、KaTeX 公式、highlight.js 高亮、Mermaid 懒加载、滚动/光标同步、本地图片内联（mdkit-doc 协议 + 目录白名单）
- **主题**：4 套内置主题 + 自定义 JSON 主题导入（id 校验 + 64KB 防护）
- **文件**：打开/新建/保存/另存为、拖拽打开、最近文件（10 条）、自动保存 + 崩溃恢复草稿
- **导出**：独立 HTML（KaTeX 字体内嵌离线可用）；**静默 PDF**（WebView2 原生 PrintToPdf：A4/页边距/背景色，选路径即落盘）
- **AI 桥接**：OpenAI 协议流式代理（Rust reqwest SSE）、取消、Diff 预览、脱敏；密钥存 Windows 凭据管理器（自动迁移 Electron 版 DPAPI 旧密钥）
- **安全**：CSP 白名单、协议白名单外链、rehype-sanitize 消毒、grantedPaths 授权集、Rust 侧 serde 强校验
- **系统集成**：原生菜单/快捷键（支持自定义覆盖）、单实例、CLI/文件关联打开 .md

---

## 🚀 快速开始

### 环境要求（构建）
- Node.js ≥ 18 / npm ≥ 9
- Rust（windows-gnu 工具链；本项目用 rsproxy 镜像）
- MinGW-W64 GCC（链接器，本机 `C:\mingw64`）
- WebView2 Runtime（Windows 10/11 自带；安装包内置在线引导器兜底）

```bash
npm install                  # 前端依赖
npm run vite:dev             # 终端1：前端开发服务
cd src-tauri/target/debug && ./md-toolbox.exe   # 终端2：应用（需先 cargo build）

npm test                     # 单元/组件/集成测试（139 项）
npm run build                # release 全量打包（vite + cargo + NSIS）
node scripts/release.mjs     # 收集产物 → release/<version>/
node scripts/probe-preview.mjs  # 无头诊断渲染链路（需 vite:dev 运行中）
```

### 工具链说明（无 MSVC 机器）
本机未装 Visual Studio Build Tools，采用替代方案（配置见 `src-tauri/.cargo/config.toml`）：
1. `rustup default stable-x86_64-pc-windows-gnu`（镜像：`RUSTUP_DIST_SERVER=https://rsproxy.cn`）
2. 链接器指向 MinGW64 GCC；cargo 依赖走 rsproxy.cn 镜像（`check-revoke=false` 已配）
3. `src-tauri/lib/` 内含 `WebView2Loader.dll` 与 gendef/dlltool 生成的 GNU 导入库，随包分发

---

## ⌨️ 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + N` / `Ctrl + O` | 新建 / 打开 |
| `Ctrl + S` / `Ctrl + Shift + S` | 保存 / 另存为 |
| `Ctrl + B` / `Ctrl + I` | 加粗 / 斜体 |
| `Ctrl + E` | 切换分屏模式 |
| `Ctrl + ,` | 打开设置 |

---

## 🗂 项目结构

```
mdKit/
├── index.html               # Vite 前端入口
├── src/
│   ├── renderer/            # React 前端（与 Electron 版 1:1 复用）
│   ├── shared/              # IPC 契约（Zod）/ 配置 Schema / 常量
│   └── tauri-bridge/        # Bridge 接口的 Tauri 实现（替代 Electron preload）
├── src-tauri/               # Rust 壳（替代 Electron 主进程）
│   └── src/
│       ├── commands/        # 27 个 IPC 命令（file/config/theme/export/draft/ai/misc）
│       ├── pdf.rs           # 静默 PDF：独立 WebView2 打印环境 + COM PrintToPdf
│       ├── menu.rs          # 原生菜单（快捷键自定义覆盖）
│       ├── asset_proto.rs   # mdkit-doc:// 本地图片协议（目录白名单）
│       ├── config.rs        # 配置存储（与前端 Zod Schema 语义对齐）
│       └── lib.rs           # Builder 装配 / 单实例 / CLI 打开 .md
├── scripts/                 # 发布收集 / 无头诊断脚本
└── docs/迁移进度与待办.md    # 迁移决策与验收记录
```

**用户数据**：沿用 `%APPDATA%\MD工具箱`（config.json / drafts / themes / logs / 凭据），与 Electron 版无缝衔接。

---

## 📄 许可证

本项目采用 **[MIT 风格开源协议](LICENSE)，商用需授权**（同原版）。商用授权请联系：**jiuji** <q2795272066@gmail.com>

> 版权 © 2026 jiuji
