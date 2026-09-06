# mdKit → Tauri 2 迁移方案

> 状态：方案评审稿 · v0.1
> 目标：在不牺牲界面品质的前提下，将 mdKit 从 Electron 迁移到 Tauri 2，把安装包从 ~92MB 降至 ~10–15MB，降低内存占用与启动时间，并保持前端（React + CodeMirror 6 + unified 渲染管线）几乎 1:1 复用。

---

## 0. 本机环境可行性确认（已实测）

方案评审时对目标开发机（Windows）实测，迁移环境无阻塞：

| 检查项 | 实测结果 | 结论 |
|--------|----------|------|
| Rust 工具链 | rustc 1.96.1 / cargo 1.96.1 | ✅ 满足 Tauri 2 要求（≥ 1.77） |
| Node / npm | v24.15.0 / 11.12.1 | ✅ 满足要求（≥ 18 / ≥ 9） |
| WebView2 Runtime | 已安装（151.0.4129.78） | ✅ 无需随包捆绑 |
| npm registry | `npm ping` 返回 PONG | ✅ 依赖可安装 |
| crates.io | HTTP 200 | ✅ Rust 依赖可拉取 |
| 渲染入口 | `src/renderer/index.html` + `main.tsx` 为标准 Vite 结构 | ✅ 可直接被 Tauri 构建复用 |

结论：本机可随时执行 P0–P5 各阶段，无需额外环境准备。

---

## 1. 迁移目标与收益

| 指标 | Electron（现状） | Tauri 2（预期） |
|------|------------------|------------------|
| Windows 安装包 | ~92MB（NSIS） | ~10–15MB（NSIS，不含 WebView2） |
| 运行时内存 | 高（打包 Chromium + Node 主进程） | 显著降低（系统 WebView2，共享内核） |
| 启动时间 | 中 | 更快（无 Node 主进程） |
| 前端代码复用 | — | ≥ 90%（仅桥接层需改） |
| 渲染内核 | Chromium | WebView2（Edge Chromium，同一内核）→ 编辑/预览/KaTeX/Mermaid 观感一致 |

**迁移的本质**：mdKit 的"壳"（Electron 主进程 + preload）与"UI"（renderer）已通过 `src/renderer/shared/bridge.ts` 的 `Bridge` 接口 + `window.mdkit` 解耦。换栈 = 重写壳 + 换桥实现，前端不动。

---

## 2. 现状盘点（迁移输入）

### 2.1 进程与目录结构（electron-vite 三段式）

```
src/main/      主进程（12 个模块）—— 迁移时整体重写为 Rust
src/preload/   类型化 contextBridge 桥 —— 迁移时删除（Tauri 无 preload）
src/renderer/  渲染进程（editor/preview/theme/ai/layout/document/components）—— 保留
src/shared/    IPC 契约（Zod）· 配置 Schema · 常量 —— 保留
```

### 2.2 IPC 面（必须完整覆盖的契约）

- **27 个 invoke 通道**（`src/shared/ipc-contract.ts` 的 `IPC` 常量）：file 8 / config 2 / theme 2 / export 2 / shell 1 / window 1 / draft 3 / log 1 / ai 5
- **4 个主进程→渲染进程推送通道**（`IPC_PUSH`）：menuCommand、openPath、aiChunk、aiDone、aiError
- 所有入站载荷主进程侧 Zod 校验（`ipc.ts` 的 `handle()` 注册器模式）

### 2.3 主进程模块职责清单

| 模块 | 职责 | Electron API 依赖 |
|------|------|------------------|
| `window.ts` | 窗口创建、CSP、外链安全打开 | BrowserWindow、shell |
| `menu.ts` | 原生菜单 + 快捷键 → 菜单命令路由 | Menu、accelerator |
| `file-service.ts` | 打开/读取/保存/另存为 + `grantedPaths` 授权集合 | dialog、fs |
| `config-store.ts` | userData/config.json 原子写 + Zod 校验 + 损坏回退 | app.getPath |
| `drafts.ts` | 崩溃恢复草稿 | fs |
| `theme-files.ts` | 自定义主题导入/列出 | dialog、fs |
| `export-service.ts` | HTML 落盘 + PDF（隐藏窗口 printToPDF） | dialog、printToPDF |
| `asset-protocol.ts` | 自定义协议：本地图片预览 + 文档目录授权 | protocol |
| `ai-service.ts` | OpenAI 流式代理 + safeStorage 密钥加密 + SSE + 取消 | fetch、safeStorage |
| `logger.ts` | 日志 | console/fs |
| `ipc.ts` | 通道注册 + Zod 校验 | ipcMain |
| `index.ts` | 生命周期、单实例、命令行/二次实例打开 .md | app |

---

## 3. 目标架构（Tauri 2）

### 3.1 目录结构

```
mdKit-tauri/
├── src/                    # 复用现有 renderer + shared（几乎不改）
│   ├── renderer/           # React 前端（原样保留）
│   ├── shared/             # IPC 契约 / 配置 Schema / 常量（原样保留）
│   └── tauri-bridge/       # 新增：window.mdkit 的 Tauri 实现（替换 preload 角色）
├── src-tauri/              # 新增：Rust 壳（替代 src/main + src/preload）
│   ├── src/
│   │   ├── main.rs         # 生命周期、单实例、CLI 打开 .md
│   │   ├── lib.rs          # Builder 装配：plugins + commands + menu + events
│   │   ├── commands/       # 命令层（对应 27 个 IPC 通道，serde 反序列化 + 校验）
│   │   │   ├── file.rs     # 打开/读取/保存/另存为/最近文件
│   │   │   ├── config.rs   # 配置读写（原子写 + 损坏回退，逻辑照搬 config-store）
│   │   │   ├── draft.rs    # 崩溃恢复草稿
│   │   │   ├── theme.rs    # 自定义主题文件
│   │   │   ├── export.rs   # HTML 落盘 + PDF（见 §5.4 spike）
│   │   │   ├── ai.rs       # OpenAI 流式代理 + 密钥存储（见 §5.5）
│   │   │   └── misc.rs     # shell 外链 / 窗口标题 / 日志
│   │   ├── state.rs        # 授权路径集合、in-flight AI 任务、配置缓存
│   │   └── fsx.rs          # 原子写、授权断言等公共工具
│   ├── capabilities/
│   │   ├── default.json    # 渲染进程权限（fs scope / dialog / http scope）
│   │   └── main.json
│   ├── tauri.conf.json     # 产品名、图标、CSP、窗口
│   ├── Cargo.toml
│   └── icons/
├── tests/                  # vitest 单测原样保留；E2E 策略见 §7
├── package.json            # scripts 换成 tauri 命令
└── README.md
```

### 3.2 进程/安全模型对照

| 维度 | Electron（现状） | Tauri 2（目标） |
|------|------------------|-----------------|
| 渲染隔离 | contextIsolation + sandbox: true | 默认隔离（WebView2），无 Node 集成 |
| 权限 | preload 白名单 + 主进程 grantedPaths | **capabilities 声明式权限**（fs scope / dialog / http scope）+ Rust 侧授权断言 |
| 外部请求 | CSP 禁外联，AI 走主进程代理 | 保持：CSP + Rust reqwest 代理，渲染进程不直连 |
| 本地图片 | 自定义 `asset://` 协议 + allowDocDir | Tauri asset 协议（scope 控制）或自定义协议 |
| 载荷校验 | 主进程 Zod 校验 | 前端保留 Zod（校验逻辑复用）+ Rust serde 类型强校验双保险 |

---

## 4. 模块迁移映射表

| Electron 模块 | Tauri 2 对应 | 迁移方式 | 风险 |
|---------------|--------------|----------|------|
| `window.ts`（窗口 + CSP） | `tauri::WebviewWindowBuilder` + `tauri.conf.json` 的 `security.csp` | 重写（声明式） | 低 |
| `menu.ts`（原生菜单/快捷键） | `tauri::menu`（Menu/MenuItem + accelerator），点击事件 `emit` 到前端沿用 `IPC_PUSH.menuCommand` | 重写 | 中（快捷键语义需逐项核对） |
| `file-service.ts` | `tauri-plugin-dialog`（打开/保存对话框）+ `tauri-plugin-fs`（读写在 scope 内）+ 自定义授权集合 | 重写；`grantedPaths` 语义由 **fs scope 自动授权** + Rust `HashSet` 双保险 | 低 |
| `config-store.ts` | Rust `serde_json` 原子写（tmp+rename，逻辑照搬）+ `app_config_dir()` | 照搬逻辑 | 低 |
| `drafts.ts` | Rust fs 命令 | 照搬 | 低 |
| `theme-files.ts` | `tauri-plugin-dialog` + fs | 照搬 | 低 |
| `export-service.ts` HTML | 保存对话框 + `fs::write` | 照搬 | 低 |
| `export-service.ts` PDF | **见 §5.4**（wry 打印 / 无头 Chromium / 前端生成） | Spike 验证后定 | **高（关键风险）** |
| `asset-protocol.ts` | `convertFileSrc`（内置 asset 协议）+ scope；或 `register_uri_scheme_protocol` | 重写 | 中 |
| `ai-service.ts` | Rust `reqwest`（SSE 逐行解析逻辑照搬）+ `AppHandle.emit` 推送 chunk/done/error + keyring 密钥 | 重写（流式 + 取消 + 密钥三件套） | 中 |
| `logger.ts` | `tauri-plugin-log` + `log` crate | 替换 | 低 |
| `ipc.ts`（Zod 校验注册器） | 前端 Zod 校验（保留 `handle()` 模式改调 `invoke`）+ Rust serde | 前端改造 | 低 |
| `index.ts`（单实例/CLI） | `tauri-plugin-single-instance` + 启动参数解析（`std::env::args` 找 .md） | 重写 | 中 |

---

## 5. 关键改造点详解

### 5.1 桥接层：`renderer/shared/bridge.ts` 是迁移支点

现状：`bridge()` 优先取 `window.mdkit`（preload 注入），否则降级为浏览器 Mock —— 前端组件全部通过 `Bridge` 接口调用，不感知实现。

迁移做法：
1. 新增 `src/tauri-bridge/index.ts`：实现同名 `Bridge` 接口，底层全部走 `@tauri-apps/api`：
   - `invoke('cmd', payload)` → 对应 Rust command
   - `event.listen('ai-chunk' | 'ai-done' | ...)` → 推送通道
   - `getCurrentWebviewWindow().onDragDropEvent` → `pathForFile`（替代 `webUtils.getPathForFile`）
   - 对话框/外链/窗口标题 → 对应官方插件
2. `bridge.ts` 的检测逻辑改为：`window.__TAURI__` 存在 → 用 Tauri 实现；否则浏览器 Mock（测试零改动）。
3. **`isElectron()` 重命名为 `isDesktop()`** 或按环境常量替换（全项目仅少量引用点）。

### 5.2 IPC 契约迁移：Zod 保留，Rust serde 兜底

- `src/shared/ipc-contract.ts` **原样保留**：前端在 `invoke` 前用 Zod 校验载荷（复用现有 `handle()` 的校验语义），非法载荷前端直接拒绝，不再依赖主进程。
- Rust 侧每个 command 参数用 `serde::Deserialize` 强类型接收（结构体与 Zod schema 字段一一对应），类型不符由 tauri 自动拒绝。
- 推送通道名从 `IPC_PUSH.*` 常量映射到 Rust `emit("ai-chunk", ...)` 的字符串常量（两端各维护一份，`shared` 里写注释锁定命名）。

### 5.3 文件授权模型：grantedPaths → capabilities scope

- Electron 版：主进程 `grantedPaths` 集合，只允许"对话框/拖拽/最近文件"来源的路径被读写。
- Tauri 版：`tauri-plugin-fs` 的 **scope 机制**（对话框/拖拽返回的路径自动进 scope）+ Rust 侧 `state.rs` 维护 `granted_paths: HashSet<PathBuf>` 双保险，行为等价。
- 拖拽路径：WebView2 上 WebviewWindow 拖拽事件直接给出路径字符串（等价于 `webUtils.getPathForFile`，无需额外授权）。

### 5.4 PDF 导出（关键风险，先做 Spike）

现状：隐藏窗口加载 HTML 快照 → `printToPDF`（A4、页边距、printBackground）。Tauri 无直接等价物，候选方案：

| 方案 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| A. wry 打印 API | Tauri 2.1+ 的 Webview 支持 `print()`（走系统打印对话框）；或 `tauri-plugin-printer` | 与现状最接近；KaTeX/代码高亮渲染一致 | 依赖用户交互选打印机；批量/静默导出弱 |
| B. 无头 Chromium | 进程内/外部调用 headless Chrome `--print-to-pdf` | 输出最接近现状（同内核） | 需随包分发或依赖系统 Chrome；体积/复杂度上升 |
| C. 前端生成 | `puppeteer-core` + 系统 Chrome / `pdf-lib` + html2canvas | 可控 | 中文/KaTeX 字体与分页还原度风险；工作量大 |
| D. 保持双轨 | 默认 A（交互式打印），高级选项 B | 灵活 | 两个实现要维护 |

**建议**：P2 阶段先做 Spike（A 优先：wry print + `@tauri-apps/plugin-printer`），以「A4 + 页边距 + 背景色 + 60 条 KaTeX 公式」为验收样例，与现状 `printToPDF` 输出对比。若 A 无法满足页边距/后台打印要求，降级 B。

### 5.5 AI 桥接（重写三件套）

- **流式代理**：Rust `reqwest` + `futures::StreamExt` 逐行解析 SSE（`data:` 前缀、`[DONE]`、JSON parse —— 逻辑从 `ai-service.ts` 照搬），每收到 delta `emit("ai-chunk", ...)`，完成 `emit("ai-done")`，异常 `emit("ai-error")`。
- **取消**：`state.rs` 维护 `inflight: Mutex<HashMap<request_id, CancellationToken>>`（或 `reqwest` abort handle），`ai:chat-cancel` 触发 abort（等价 AbortController）。
- **密钥安全存储**：`safeStorage`（DPAPI）→ Rust `keyring` crate（Windows Credential Manager）。保留语义：密钥不落普通配置、不写日志、为空即删除；`ai:secret-status` 只返回 `hasKey`。
- **超时**：`AI_REQUEST_TIMEOUT_MS` 常量照搬（tokio timeout）。

### 5.6 菜单、单实例、CLI

- 菜单：`tauri::menu` 构建与现状相同的层级（文件/视图/主题/帮助），`menuCommand` 枚举与 `MENU_COMMANDS` 一一对应，点击 `emit` 复用 `IPC_PUSH.menuCommand` 通道，前端路由零改动。
- 单实例 + 双击 .md 关联：`tauri-plugin-single-instance`（focus 回调）+ 启动参数解析（`args().skip(1)` 找 `.md` 路径，等价 `mdPathFromArgv`），复用 `IPC_PUSH.openPath` 推送。
- 文件关联（.md 双击打开）：`tauri.conf.json` 的 `bundle.fileAssociations` 注册（对应 Electron 版双击/拖拽 exe 场景）。

### 5.7 主题、草稿、最近文件

- 配置/草稿/主题文件均落在 `app_config_dir()/app_data_dir()`（等价 userData），序列化逻辑、Zod schema、损坏回退 `.bak` 逻辑全部照搬。
- 自定义主题 JSON 校验（Zod）保留在前端，Rust 只做 `Vec<u8>`/字符串透传 + 落盘。

---

## 6. 前端复用改动点清单（预计改动面 < 10%）

| 文件 | 改动 |
|------|------|
| `src/renderer/shared/bridge.ts` | 检测逻辑 `window.mdkit` → Tauri 实现注入；`isElectron()` 更名 |
| `src/renderer/shared/bridge.ts` | `pathForFile` 改为拖拽事件取路径 |
| 新增 `src/tauri-bridge/` | Tauri `Bridge` 实现（invoke 封装 + event.listen 封装 + 插件调用） |
| 各调用点 | `bridge()` 接口不变，几乎零改动 |
| `src/renderer/index.html` | CSP 与 `__TAURI__` 初始化（如需要） |
| 事件监听处（AI 面板等） | `onChunk/onDone/onError/onMenuCommand/onOpenPath` 返回的取消函数语义保持一致（Tauri `unlisten`） |

**不需要动**：editor/、preview/、theme/、layout/、document/、components/、ai/ 的 UI 与状态逻辑、`src/shared/` 全部、渲染管线 worker、Mermaid/KaTeX 懒加载、主题引擎。

---

## 7. 测试策略

| 层 | 现状 | 迁移后 |
|----|------|--------|
| 单元/组件/集成（vitest） | 139 项 | **原样保留**（bridge Mock 降级机制不受影响） |
| 离线沙盒（Node） | 92 项 | 保留（纯逻辑） |
| 性能基准 | 3 项 | 保留 |
| 浏览器级 E2E | Playwright 连 dev server（Web 模式） | 保留：Tauri 前端是标准 Web，`vite dev` + Playwright 仍可驱动大部分流程 |
| 真实壳 E2E | Playwright 驱动 Electron | 改为 `tauri-driver`（WebDriver）做少量 smoke（启动→打开文件→保存→导出）；Windows 上配置成本较高，若超预期可降级为手工验收清单 |

---

## 8. 分阶段实施计划

| 阶段 | 内容 | 验收标准 |
|------|------|----------|
| **P0 骨架** | 新建 Tauri 2 + React 工程；迁移 renderer/shared；桥接层跑通 | dev 模式启动，编辑器可输入、预览实时渲染、主题切换生效 |
| **P1 文件与持久化** | 打开/保存/另存为/拖拽/最近文件/配置/草稿/自定义主题 | 与 Electron 版行为逐一对照通过 |
| **P2 导出** | HTML 落盘；**PDF Spike**（§5.4）定案并实现 | A4/页边距/背景/KaTeX 输出与现状对比通过 |
| **P3 AI 桥** | reqwest 流式 + 取消 + keyring 密钥 + 测试连接 | 对话/Diff 面板全链路可用；断网/取消/错误路径正确 |
| **P4 壳完善** | 原生菜单/快捷键、单实例、.md 文件关联、窗口状态记忆、外链打开 | 快捷键表与现状一致；双击 .md 打开 |
| **P5 打包与质量** | NSIS + portable、图标、CSP 终检；全量测试适配；性能对比 | 安装包 ≤ 15MB；单测/沙盒全绿；内存/启动对比报告 |

> 建议 P0 与 P2 的 PDF Spike 并行启动（PDF 是唯一高风险项，尽早暴露）。

---

## 9. 打包与发布对照

| Electron（现状） | Tauri 2（目标） |
|------------------|-----------------|
| electron-builder NSIS + portable | `tauri build` → NSIS + portable（`bundle.targets`） |
| 自定义安装目录（NSIS allowToChangeInstallationDirectory） | NSIS 默认支持选择目录；可通过 `installer` 覆盖定制 |
| 图标 `build/icon.png` | 需生成多尺寸 `icons/`（`tauri icon` 命令从 png 一键生成） |
| 应用标识 appId | `identifier`（如 `dev.jiuji.mdtoolbox`，保持） |
| 自动更新 | 现状未启用，本期不引入（可选后续 `tauri-plugin-updater`） |

---

## 10. 风险登记

| 风险 | 等级 | 缓解 |
|------|------|------|
| PDF 导出无 printToPDF 等价物 | **高** | P2 前置 Spike（§5.4），方案 A→B 降级路径 |
| WebView2 依赖（精简企业镜像缺失） | 中 | 文档注明要求 WebView2 Runtime；可选 `webviewInstallMode` 捆绑 |
| Rust 学习成本 / 编译时间 | 中 | 壳保持薄层；命令/工具逻辑照搬 TS；CI 缓存 cargo |
| tauri-driver E2E 配置成本 | 中 | 降级方案：浏览器 E2E + 手工验收清单 |
| 菜单快捷键语义差异 | 低 | P4 逐项对照 `MENU_COMMANDS` 验收 |
| 密钥存储语义差异（DPAPI→Credential Manager） | 低 | keyring 同为系统凭据能力，语义一致 |

---

## 11. 工作量估算（粗）

| 阶段 | 预估（人日） |
|------|--------------|
| P0 骨架 + 桥接 | 2–3 |
| P1 文件/持久化 | 2–3 |
| P2 导出（含 PDF Spike） | 2–4 |
| P3 AI 桥 | 2–3 |
| P4 壳完善 | 1–2 |
| P5 打包/测试/验收 | 2–3 |
| **合计** | **11–18 人日** |

> 对比：Electron 版从头开发约 30+ 人日（按 README 全量功能推算），迁移利用前端复用可省一半以上。

---

## 12. 待决策事项

1. **PDF 方案**：确认接受 Spike 流程（P2 先验证再定案）
2. **密钥存储**：keyring（Credential Manager）是否满足要求（默认是）
3. **E2E 深度**：是否投入 tauri-driver smoke（P5 前再定）
4. **命名/仓库**：迁移产物放独立仓库（`mdkit-tauri`）还是同仓分支

---

*文档关联：`docs/需求分析文档.md`（功能基线）、`docs/架构设计文档.md`（现状架构）、`src/shared/ipc-contract.ts`（契约面）。*
