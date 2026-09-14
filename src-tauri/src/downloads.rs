use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Mutex,
};

use sysinfo::{Pid, System};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
use walkdir::WalkDir;

use crate::{models::{DownloadProgress, Track}, runtime};

#[derive(Default)]
pub struct DownloadManager {
    processes: Mutex<HashMap<String, u32>>,
}

fn allowed_audio(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|v| v.to_str()).map(|v| v.to_ascii_lowercase()).as_deref(),
        Some("mp3" | "m4a" | "flac" | "wav" | "opus" | "ogg" | "webm")
    )
}

fn validated_child_path(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| format!("Could not open download folder: {e}"))?;
    let target = if target.exists() {
        target.canonicalize().map_err(|e| format!("Could not open target file: {e}"))?
    } else {
        let parent = target.parent().ok_or_else(|| "Target has no parent folder".to_string())?;
        let parent = parent.canonicalize().map_err(|e| format!("Could not open target folder: {e}"))?;
        let name = target.file_name().ok_or_else(|| "Target has no file name".to_string())?;
        parent.join(name)
    };
    if !target.starts_with(&root) {
        return Err("Refusing to access a file outside the selected Music folder".to_string());
    }
    Ok(target)
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let rest = line.trim().strip_prefix("FRXE:")?;
    let mut parts = rest.splitn(4, '|');
    let percent = parts.next()?.trim().trim_end_matches('%').trim().parse::<f64>().ok()?;
    let speed = parts.next().unwrap_or("").trim().to_string();
    let eta = parts.next().unwrap_or("").trim().to_string();
    let item_title = parts.next().unwrap_or("").trim().to_string();
    Some(DownloadProgress {
        task_id: String::new(),
        percent,
        speed,
        eta,
        item_title,
    })
}

#[tauri::command]
pub async fn scan_downloads(dir: String) -> Result<Vec<Track>, String> {
    let root = PathBuf::from(dir);
    if !root.is_dir() { return Ok(Vec::new()); }
    let mut tracks = Vec::new();
    for entry in WalkDir::new(&root).max_depth(2).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !entry.file_type().is_file() || !allowed_audio(path) { continue; }
        let absolute = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let title = absolute.file_stem().and_then(|v| v.to_str()).unwrap_or("Offline track").to_string();
        let path_string = absolute.to_string_lossy().into_owned();
        tracks.push(Track {
            id: path_string.clone(),
            kind: "local".to_string(),
            title,
            artist: "Offline".to_string(),
            album: None,
            cover: None,
            duration_seconds: None,
            source: Some("Offline".to_string()),
            path: Some(path_string),
        });
    }
    tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(tracks)
}

#[tauri::command]
pub async fn clear_removed_downloads(_download_dir: String) -> Result<u32, String> {
    Ok(0)
}

#[tauri::command]
pub async fn download_already_exists(video_id: String, output_dir: String) -> Result<bool, String> {
    if video_id.is_empty() { return Ok(false); }
    let root = PathBuf::from(output_dir);
    if !root.is_dir() { return Ok(false); }
    let marker = format!("[{video_id}]");
    Ok(WalkDir::new(root)
        .max_depth(2)
        .into_iter()
        .filter_map(Result::ok)
        .any(|entry| entry.file_type().is_file() && entry.file_name().to_string_lossy().contains(&marker)))
}

#[tauri::command]
pub async fn remove_download(path: String, download_dir: String) -> Result<(), String> {
    let root = PathBuf::from(download_dir);
    let target = validated_child_path(&root, &PathBuf::from(path))?;
    if !target.is_file() { return Err("Downloaded file no longer exists".to_string()); }
    tokio::fs::remove_file(target).await.map_err(|e| format!("Could not remove download: {e}"))
}

fn quality_value(value: &str) -> &'static str {
    match value {
        "best" => "0",
        "high" => "2",
        "balanced" => "5",
        _ => "5",
    }
}

#[tauri::command]
pub async fn download_track(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
    task_id: String,
    url: String,
    output_dir: String,
    format: String,
    quality: String,
    allow_playlist: bool,
) -> Result<(), String> {
    if !url.starts_with("https://www.youtube.com/") && !url.starts_with("https://youtu.be/") {
        return Err("Frxe downloads only accept YouTube track URLs".to_string());
    }
    let output_root = PathBuf::from(output_dir);
    tokio::fs::create_dir_all(&output_root).await.map_err(|e| format!("Could not create download folder: {e}"))?;

    let runtime_dir = runtime::runtime_dir(&app)?;
    let ytdlp = runtime::resolve_ytdlp(&runtime_dir)?;
    let ffmpeg = runtime::resolve_ffmpeg(&runtime_dir);
    if matches!(format.as_str(), "mp3" | "flac" | "wav" | "m4a") && ffmpeg.is_none() {
        return Err("FFmpeg is required for this format. Install FFmpeg, then use Update runtime dependencies again.".to_string());
    }

    let output_template = output_root.join("%(title).180B [%(id)s].%(ext)s").to_string_lossy().into_owned();
    let mut args: Vec<String> = vec![
        "--newline".into(),
        "--progress".into(),
        "--progress-template".into(),
        "download:FRXE:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s".into(),
        "-o".into(),
        output_template,
    ];
    if !allow_playlist { args.push("--no-playlist".into()); }
    if let Some(ffmpeg) = ffmpeg {
        args.push("--ffmpeg-location".into());
        args.push(ffmpeg.to_string_lossy().into_owned());
    }
    match format.as_str() {
        "mp3" | "flac" | "wav" => {
            args.extend(["-x".into(), "--audio-format".into(), format.clone(), "--audio-quality".into(), quality_value(&quality).into()]);
        }
        "m4a" => {
            args.extend(["-f".into(), "bestaudio[ext=m4a]/bestaudio".into(), "--remux-video".into(), "m4a".into()]);
        }
        _ => return Err("Unsupported audio format".to_string()),
    }
    args.push(url);

    let mut child = Command::new(&ytdlp)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not launch yt-dlp download: {e}"))?;
    let pid = child.id().ok_or_else(|| "Could not track download process".to_string())?;
    manager.processes.lock().map_err(|_| "Download state is unavailable".to_string())?.insert(task_id.clone(), pid);

    let stdout = child.stdout.take().ok_or_else(|| "Download output is unavailable".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Download error output is unavailable".to_string())?;
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut text = String::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if !text.is_empty() { text.push('\n'); }
            text.push_str(&line);
        }
        text
    });

    let mut lines = BufReader::new(stdout).lines();
    while let Some(line) = lines.next_line().await.map_err(|e| format!("Could not read download progress: {e}"))? {
        if let Some(mut progress) = parse_progress(&line) {
            progress.task_id = task_id.clone();
            let _ = app.emit("download-progress", progress);
        }
    }

    let status = child.wait().await.map_err(|e| format!("Could not wait for download: {e}"))?;
    let stderr_text = stderr_task.await.unwrap_or_default();
    manager.processes.lock().map_err(|_| "Download state is unavailable".to_string())?.remove(&task_id);
    if status.success() {
        Ok(())
    } else {
        let detail = stderr_text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("yt-dlp exited with an error");
        Err(format!("Download failed: {detail}"))
    }
}

#[tauri::command]
pub fn cancel_download(manager: State<'_, DownloadManager>, task_id: String) -> Result<(), String> {
    let pid = manager.processes.lock().map_err(|_| "Download state is unavailable".to_string())?.remove(&task_id);
    let Some(pid) = pid else { return Ok(()); };
    let mut system = System::new_all();
    system.refresh_all();
    let process = system.process(Pid::from_u32(pid));
    match process {
        Some(process) if process.kill() => Ok(()),
        Some(_) => Err("Could not cancel the download process".to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_line() {
        let p = parse_progress("FRXE:42.5%|1.2MiB/s|00:31|Example Song").unwrap();
        assert_eq!(p.percent, 42.5);
        assert_eq!(p.speed, "1.2MiB/s");
        assert_eq!(p.item_title, "Example Song");
    }

    #[test]
    fn rejects_delete_outside_root() {
        let root = tempfile::tempdir().unwrap();
        let outside = root.path().parent().unwrap().join("outside.mp3");
        assert!(validated_child_path(root.path(), &outside).is_err());
    }
}
