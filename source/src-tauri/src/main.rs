#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod files;
mod asset_geometry;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WindowEvent};

#[derive(Default)]
struct CloseGuard(AtomicBool);

#[tauri::command]
fn enable_close_guard(guard: tauri::State<'_, CloseGuard>) {
    guard.0.store(true, Ordering::Relaxed);
}

const WEBVIEW_DOWNLOAD: &str = "https://developer.microsoft.com/microsoft-edge/webview2/#download";

fn ask(title: &str, description: &str) -> bool {
    rfd::MessageDialog::new()
        .set_title(title)
        .set_description(description)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show() == rfd::MessageDialogResult::Yes
}

#[tauri::command]
fn update_title(window: tauri::WebviewWindow, title: String) -> Result<(), String> {
    let title: String = title.chars().take(240).collect();
    window.set_title(&format!("{title} — 天际线Ⅱ地图规划设计器")).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    let fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
async fn confirm_discard() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| ask("未保存的工程", "放弃未保存的修改并退出吗？"))
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) { app.exit(0); }

#[tauri::command]
fn open_reference(key: &str) -> Result<(), String> {
    let url = match key {
        "source" => "https://github.com/AcrabTans/cs2-map-design",
        "issues" => "https://github.com/AcrabTans/cs2-map-design/issues",
        "carto" => "https://github.com/taipei-native/Carto",
        "overlay" => "https://mods.paradoxplaza.com/mods/74539/Windows",
        _ => return Err("未知的帮助链接".into()),
    };
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开浏览器：{error}"))
}

fn main() {
    if !matches!(tauri::webview_version(), Ok(version) if !version.is_empty() && version != "0.0.0.0") {
        if ask("需要 WebView2", "此电脑缺少 Microsoft Edge WebView2 运行时。安装后重新运行本程序。现在打开微软下载页吗？") {
            let _ = std::process::Command::new("rundll32.exe")
                .args(["url.dll,FileProtocolHandler", WEBVIEW_DOWNLOAD]).spawn();
        }
        return;
    }
    if let Err(error) = tauri::Builder::default()
        .manage(files::FileGrants::default())
        .manage(CloseGuard::default())
        .setup(|app| {
            let launch = (|| -> Result<(), Box<dyn std::error::Error>> {
                let executable = std::env::current_exe()?;
                let directory = executable.parent().ok_or("无法定位程序目录")?;
                let data = directory.join("userdata").join("webview");
                std::fs::create_dir_all(&data)?;
                tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                    .data_directory(data).build()?;
                Ok(())
            })();
            if let Err(error) = launch {
                rfd::MessageDialog::new().set_title("地图规划设计器无法启动")
                    .set_description(format!("请将程序解压到可写目录。\n{error}")).show();
                app.handle().exit(1);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::pick_files, files::pick_directory, files::pick_save, files::file_stat,
            files::read_file, files::write_file, files::directory_entries, files::directory_child,
            files::write_extracted_asset, asset_geometry::asset_zstd, asset_geometry::asset_project,
            update_title, toggle_fullscreen, confirm_discard, exit_app, enable_close_guard, open_reference
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<CloseGuard>().0.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.emit("mapdesign-close", ());
                }
            }
        })
        .run(tauri::generate_context!())
    {
        rfd::MessageDialog::new().set_title("地图规划设计器无法启动")
            .set_description(format!("{error}")).show();
    }
}
