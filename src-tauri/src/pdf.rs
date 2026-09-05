//! 静默 PDF 导出：自管理 WebView2 打印环境（隐藏窗口）+ ICoreWebView2_7::PrintToPdf。
//!
//! 为什么不用 Tauri 主 webview：导出快照需要加载临时 HTML，不能打扰用户正在编辑的页面；
//! 且 PrintToPdf 需要 ICoreWebView2Environment6::CreatePrintSettings（A4/页边距/背景），
//! 自建环境可以在创建时即持有 environment，链路最短。
//!
//! 流程（专用 STA 线程 + 消息泵）：
//!   CreateEnvironment → CreateController(隐藏窗口) → 配置 Settings（禁脚本）
//!   → 虚拟主机映射临时目录 → Navigate → NavigationCompleted
//!   → CreatePrintSettings(A4, margins, backgrounds) → PrintToPdf → 完成回调。
#![cfg(windows)]

use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use webview2_com::Microsoft::Web::WebView2::Win32::*;
use windows::core::{w, HSTRING, Interface, PCWSTR};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::WinRT::EventRegistrationToken;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;

const CLASS_NAME: PCWSTR = w!("mdkit_print_host");

/// 消息泵转发过程（WNDCLASSEXW 需要裸 extern "system" fn 指针）
unsafe extern "system" fn print_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}
const PRINT_TIMEOUT: Duration = Duration::from_secs(60);
/// Electron 版 printToPDF 参数：A4、上下 0.6in、左右 0.5in、打印背景
const A4_WIDTH_IN: f64 = 8.27;
const A4_HEIGHT_IN: f64 = 11.69;
const MARGIN_TOP: f64 = 0.6;
const MARGIN_BOTTOM: f64 = 0.6;
const MARGIN_LEFT: f64 = 0.5;
const MARGIN_RIGHT: f64 = 0.5;

type Tx = mpsc::Sender<Result<(), String>>;

/// 入口：阻塞直至导出完成（调用方放 spawn_blocking）。
pub fn print_to_pdf(html: &str, out_path: &Path) -> Result<(), String> {
    let out_abs = out_path
        .canonicalize()
        .unwrap_or_else(|_| out_path.to_path_buf());
    let temp_dir = std::env::temp_dir().join("mdkit-print-profile");
    let _ = std::fs::create_dir_all(&temp_dir);
    let snapshot = temp_dir.join("export.html");
    std::fs::write(&snapshot, html.as_bytes()).map_err(|e| format!("写入临时文件失败：{e}"))?;

    let result = run_print_thread(&out_abs, &temp_dir);

    // 清理临时目录（浏览器进程可能短暂占用，重试几次）
    for _ in 0..3 {
        if std::fs::remove_dir_all(&temp_dir).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    result
}

fn run_print_thread(out_path: &Path, temp_dir: &Path) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let out_path = out_path.to_path_buf();
    let temp_dir = temp_dir.to_path_buf();

    let worker = std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let res = pump_and_print(&out_path, &temp_dir, tx, rx);
        let _ = CoUninitialize();
        res
    });
    // pump_and_print 内部带 60s 超时，join 即可等待
    worker.join().unwrap_or_else(|_| Err("打印线程异常退出".into()))
}

unsafe fn pump_and_print(out_path: &Path, temp_dir: &Path, tx: Tx, rx: mpsc::Receiver<Result<(), String>>) -> Result<(), String> {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let hinstance = HINSTANCE(GetModuleHandleW(None).unwrap_or_default().0);

    let wc = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        lpfnWndProc: Some(print_wndproc),
        hInstance: hinstance.into(),
        lpszClassName: CLASS_NAME,
        hCursor: windows::Win32::UI::WindowsAndMessaging::LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
        ..Default::default()
    };
    RegisterClassExW(&wc);

    let hwnd = CreateWindowExW(
        WINDOW_EX_STYLE(0),
        CLASS_NAME,
        w!("mdkit print"),
        WS_POPUP,
        0,
        0,
        1200,
        1600,
        None,
        None,
        Some(hinstance.into()),
        None,
    )
    .map_err(|e| format!("创建打印窗口失败：{e}"))?;

    let _ = SetTimer(Some(hwnd), 1, 2000, None);

    let user_data = temp_dir.join("profile");
    let _ = std::fs::create_dir_all(&user_data);
    let env_handler: ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler =
        EnvCompletedHandler { hwnd, tx: tx.clone(), out_path: out_path.to_path_buf(), temp_dir: temp_dir.to_path_buf() }.into();

    let create_result = CreateCoreWebView2EnvironmentWithOptions(
        PCWSTR::null(),
        &windows::core::HSTRING::from(user_data.as_os_str()),
        None,
        &env_handler,
    );
    if let Err(e) = create_result {
        let _ = tx.send(Err(format!("WebView2 环境创建失败：{e}")));
    }

    let start = Instant::now();
    let mut result: Result<(), String> = Err("打印中断".into());
    let mut done = false;
    while !done {
        match rx.try_recv() {
            Ok(res) => {
                result = res;
                break;
            }
            Err(mpsc::TryRecvError::Disconnected) => break,
            Err(mpsc::TryRecvError::Empty) => {}
        }
        if start.elapsed() > PRINT_TIMEOUT {
            result = Err("PDF 打印超时（60s）".into());
            break;
        }
        let mut msg = MSG::default();
        if GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        } else {
            // WM_QUIT：完成回调尚未送达即退出，报错
            result = Err("打印窗口消息循环意外退出".into());
            break;
        }
    }

    let _ = KillTimer(Some(hwnd), 1);
    let _ = DestroyWindow(hwnd);
    result
}

/* ---------- COM 事件处理器 ---------- */

#[windows::core::implement(ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler)]
struct EnvCompletedHandler {
    hwnd: HWND,
    tx: Tx,
    out_path: std::path::PathBuf,
    temp_dir: std::path::PathBuf,
}

impl ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler_Impl for EnvCompletedHandler_Impl {
    fn Invoke(
        &self,
        error_code: windows::core::HRESULT,
        environment: windows_core::Ref<'_, ICoreWebView2Environment>,
    ) -> windows_core::Result<()> {
        if error_code.is_err() {
            let _ = self.tx.send(Err(format!("WebView2 环境创建失败：{error_code}")));
            return Ok(());
        }
        let Some(env) = environment.as_ref().cloned() else {
            let _ = self.tx.send(Err("WebView2 环境为空".into()));
            return Ok(());
        };
        let controller_handler: ICoreWebView2CreateCoreWebView2ControllerCompletedHandler =
            ControllerCompletedHandler {
                environment: env.clone(),
                tx: self.tx.clone(),
                out_path: self.out_path.clone(),
                temp_dir: self.temp_dir.clone(),
            }
            .into();
        unsafe {
            if let Err(e) = env.CreateCoreWebView2Controller(self.hwnd, &controller_handler) {
                let _ = self.tx.send(Err(format!("创建打印视图失败：{e}")));
            }
        }
        Ok(())
    }
}

#[windows::core::implement(ICoreWebView2CreateCoreWebView2ControllerCompletedHandler)]
struct ControllerCompletedHandler {
    environment: ICoreWebView2Environment,
    tx: Tx,
    out_path: std::path::PathBuf,
    temp_dir: std::path::PathBuf,
}

impl ICoreWebView2CreateCoreWebView2ControllerCompletedHandler_Impl for ControllerCompletedHandler_Impl {
    fn Invoke(
        &self,
        error_code: windows::core::HRESULT,
        controller_ref: windows_core::Ref<'_, ICoreWebView2Controller>,
    ) -> windows_core::Result<()> {
        if error_code.is_err() {
            let _ = self.tx.send(Err(format!("创建打印视图失败：{error_code}")));
            return Ok(());
        }
        let Some(controller) = controller_ref.as_ref().cloned() else {
            let _ = self.tx.send(Err("打印视图为空".into()));
            return Ok(());
        };
        unsafe {
            let Ok(webview) = controller.CoreWebView2() else {
                let _ = self.tx.send(Err("获取打印视图失败".into()));
                return Ok(());
            };
            // 导出快照无需脚本（对齐 Electron printWin javascript:false）
            if let Ok(settings) = webview.cast::<ICoreWebView2Settings>() {
                let _ = settings.SetIsScriptEnabled(false);
                let _ = settings.SetAreDefaultScriptDialogsEnabled(false);
                let _ = settings.SetAreDevToolsEnabled(false);
            }
            // 虚拟主机映射临时目录，规避 file:// 导航限制
            let Ok(webview3) = webview.cast::<ICoreWebView2_3>() else {
                let _ = self.tx.send(Err("WebView2 版本过旧（缺 ICoreWebView2_3）".into()));
                return Ok(());
            };
            if let Err(e) = webview3.SetVirtualHostNameToFolderMapping(
                &windows::core::HSTRING::from("mdkit-print"),
                &windows::core::HSTRING::from(self.temp_dir.as_os_str()),
                COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW,
            ) {
                let _ = self.tx.send(Err(format!("虚拟主机映射失败：{e}")));
                return Ok(());
            }

            let nav_handler: ICoreWebView2NavigationCompletedEventHandler = NavigationCompletedHandler {
                environment: self.environment.clone(),
                webview: webview.clone(),
                tx: self.tx.clone(),
                out_path: self.out_path.clone(),
            }
            .into();
            let mut nav_token = EventRegistrationToken::default();
            if let Err(e) = webview.add_NavigationCompleted(&nav_handler, &mut nav_token) {
                let _ = self.tx.send(Err(format!("注册导航回调失败：{e}")));
                return Ok(());
            }
            if let Err(e) = webview.Navigate(&windows::core::HSTRING::from("http://mdkit-print/export.html")) {
                let _ = self.tx.send(Err(format!("加载导出内容失败：{e}")));
            }
        }
        Ok(())
    }
}

#[windows::core::implement(ICoreWebView2NavigationCompletedEventHandler)]
struct NavigationCompletedHandler {
    environment: ICoreWebView2Environment,
    webview: ICoreWebView2,
    tx: Tx,
    out_path: std::path::PathBuf,
}

impl ICoreWebView2NavigationCompletedEventHandler_Impl for NavigationCompletedHandler_Impl {
    fn Invoke(
        &self,
        _sender: windows_core::Ref<'_, ICoreWebView2>,
        args: windows_core::Ref<'_, ICoreWebView2NavigationCompletedEventArgs>,
    ) -> windows_core::Result<()> {
        let success = args.as_ref().map_or(false, |a| unsafe {
            let mut ok = windows::Win32::Foundation::BOOL::default();
            a.IsSuccess(&mut ok).is_ok() && ok.as_bool()
        });
        if !success {
            let _ = self.tx.send(Err("加载导出内容失败".into()));
            return Ok(());
        }
        unsafe {
            // A4 + 页边距 + 背景（对齐 Electron printToPDF 参数）
            let Ok(env6) = self.environment.cast::<ICoreWebView2Environment6>() else {
                let _ = self.tx.send(Err("WebView2 运行时过旧，无法静默导出 PDF，请更新 WebView2".into()));
                return Ok(());
            };
            let Ok(print_settings) = env6.CreatePrintSettings() else {
                let _ = self.tx.send(Err("创建打印设置失败".into()));
                return Ok(());
            };
            let _ = print_settings.SetPageWidth(A4_WIDTH_IN);
            let _ = print_settings.SetPageHeight(A4_HEIGHT_IN);
            let _ = print_settings.SetMarginTop(MARGIN_TOP);
            let _ = print_settings.SetMarginBottom(MARGIN_BOTTOM);
            let _ = print_settings.SetMarginLeft(MARGIN_LEFT);
            let _ = print_settings.SetMarginRight(MARGIN_RIGHT);
            let _ = print_settings.SetShouldPrintBackgrounds(true);
            let _ = print_settings.SetShouldPrintHeaderAndFooter(false);

            let Ok(webview7) = self.webview.cast::<ICoreWebView2_7>() else {
                let _ = self.tx.send(Err("WebView2 运行时过旧（缺 ICoreWebView2_7），请更新".into()));
                return Ok(());
            };
            let pdf_handler: ICoreWebView2PrintToPdfCompletedHandler =
                PrintToPdfCompletedHandler { tx: self.tx.clone() }.into();
            if let Err(e) = webview7.PrintToPdf(
                &windows::core::HSTRING::from(self.out_path.as_os_str()),
                &print_settings,
                &pdf_handler,
            ) {
                let _ = self.tx.send(Err(format!("发起 PDF 打印失败：{e}")));
            }
        }
        Ok(())
    }
}

#[windows::core::implement(ICoreWebView2PrintToPdfCompletedHandler)]
struct PrintToPdfCompletedHandler {
    tx: Tx,
}

impl ICoreWebView2PrintToPdfCompletedHandler_Impl for PrintToPdfCompletedHandler_Impl {
    fn Invoke(
        &self,
        error_code: windows::core::HRESULT,
        result: windows::Win32::Foundation::BOOL,
    ) -> windows_core::Result<()> {
        if error_code.is_err() {
            let _ = self.tx.send(Err(format!("PDF 打印失败：{error_code}")));
            return Ok(());
        }
        if result.as_bool() {
            let _ = self.tx.send(Ok(()));
        } else {
            let _ = self.tx.send(Err("PDF 打印失败（输出未成功写入）".into()));
        }
        Ok(())
    }
}

// 静告警：未直接使用但保留以表明消息循环所需的 Win32 导入
#[allow(unused)]
fn _unused(_w: WPARAM, _l: LPARAM, _r: LRESULT) {}
