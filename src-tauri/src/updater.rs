use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppUpdateProgress {
    state: String,
    downloaded: u64,
    total: Option<u64>,
}

fn emit_progress(app: &AppHandle, state: &str, downloaded: u64, total: Option<u64>) {
    let _ = app.emit(
        "app-update-progress",
        AppUpdateProgress {
            state: state.to_string(),
            downloaded,
            total,
        },
    );
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<Option<AppUpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| format!("Could not initialize Frxe updater: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Could not check for Frxe updates: {e}"))?;

    Ok(update.map(|update| AppUpdateInfo {
        version: update.version,
        notes: update.body,
        date: update.date.map(|date| date.to_string()),
    }))
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<(), String> {
    let Some(update) = app
        .updater()
        .map_err(|e| format!("Could not initialize Frxe updater: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Could not check for Frxe updates: {e}"))?
    else {
        return Err("No Frxe update is currently available.".to_string());
    };

    emit_progress(&app, "starting", 0, None);
    let downloaded = Arc::new(AtomicU64::new(0));
    let progress_downloaded = Arc::clone(&downloaded);
    let finish_downloaded = Arc::clone(&downloaded);
    let progress_app = app.clone();
    let finish_app = app.clone();

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let current = progress_downloaded.fetch_add(chunk_length as u64, Ordering::Relaxed)
                    + chunk_length as u64;
                emit_progress(&progress_app, "downloading", current, content_length);
            },
            move || {
                emit_progress(
                    &finish_app,
                    "installing",
                    finish_downloaded.load(Ordering::Relaxed),
                    None,
                );
            },
        )
        .await
        .map_err(|e| format!("Frxe update failed: {e}"))?;

    emit_progress(
        &app,
        "installed",
        downloaded.load(Ordering::Relaxed),
        None,
    );

    #[cfg(not(target_os = "windows"))]
    app.restart();

    Ok(())
}
