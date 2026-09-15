mod downloads;
mod lyrics;
mod models;
mod runtime;
mod search;
mod tray;

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(downloads::DownloadManager::default())
        .setup(|app| {
            tray::install(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search::innertube_search,
            search::ytdlp_search,
            search::resolve_stream_url,
            downloads::scan_downloads,
            downloads::clear_removed_downloads,
            downloads::download_already_exists,
            downloads::download_track,
            downloads::cancel_download,
            downloads::remove_download,
            lyrics::fetch_metadata_lyrics,
            runtime::update_runtime_dependencies,
            runtime::current_runtime_status,
            tray::set_tray_enabled,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("Frxe Desktop failed to start");
}
