use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::Manager;
use tokio::process::Command;

use crate::models::RuntimeStatus;

pub fn silent_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub fn ytdlp_asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else {
        "yt-dlp_linux"
    }
}

pub fn ytdlp_download_url() -> String {
    format!(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}",
        ytdlp_asset_name()
    )
}

fn executable_in_path(name: &str) -> Option<PathBuf> {
    env::var_os("PATH")
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

pub fn runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not locate Frxe app data: {e}"))?
        .join("runtime");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create Frxe runtime folder: {e}"))?;
    Ok(dir)
}

pub fn resolve_ytdlp(dir: &Path) -> Result<PathBuf, String> {
    let local = dir.join(ytdlp_asset_name());
    if local.is_file() {
        return Ok(local);
    }
    let path_name = if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" };
    executable_in_path(path_name)
        .ok_or_else(|| "yt-dlp is unavailable. Open Settings and use Update runtime dependencies first.".to_string())
}

pub fn resolve_ffmpeg(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    let local = dir.join(name);
    if local.is_file() { Some(local) } else { executable_in_path(name) }
}

pub fn resolve_deno(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") { "deno.exe" } else { "deno" };
    let local = dir.join(name);
    if local.is_file() { Some(local) } else { executable_in_path(name) }
}

async fn first_version_line(path: &Path, args: &[&str]) -> Option<String> {
    let output = silent_command(path).args(args).output().await.ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

async fn status_for_dir(dir: &Path) -> RuntimeStatus {
    let ytdlp = resolve_ytdlp(dir).ok();
    let deno = resolve_deno(dir);
    let ffmpeg = resolve_ffmpeg(dir);
    let mut warnings = Vec::new();
    if deno.is_none() {
        warnings.push("Deno was not found. yt-dlp can still work, but some YouTube extraction paths may be less compatible.".to_string());
    }
    if ffmpeg.is_none() {
        warnings.push("FFmpeg was not found. MP3, FLAC, WAV and M4A conversion/remux require FFmpeg.".to_string());
    }

    RuntimeStatus {
        yt_dlp_version: match ytdlp.as_deref() {
            Some(path) => first_version_line(path, &["--version"]).await,
            None => None,
        },
        deno_version: match deno.as_deref() {
            Some(path) => first_version_line(path, &["--version"]).await,
            None => None,
        },
        ffmpeg_version: match ffmpeg.as_deref() {
            Some(path) => first_version_line(path, &["-version"]).await,
            None => None,
        },
        yt_dlp_path: ytdlp.map(|p| p.to_string_lossy().into_owned()),
        deno_path: deno.map(|p| p.to_string_lossy().into_owned()),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
        warnings,
    }
}

#[tauri::command]
pub async fn update_runtime_dependencies(app: tauri::AppHandle) -> Result<RuntimeStatus, String> {
    let dir = runtime_dir(&app)?;
    let target = dir.join(ytdlp_asset_name());
    let response = reqwest::Client::new()
        .get(ytdlp_download_url())
        .header("User-Agent", "Frxe-Desktop/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Could not download yt-dlp: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Could not download yt-dlp: {e}"))?;
    let bytes = response.bytes().await.map_err(|e| format!("Could not read yt-dlp download: {e}"))?;
    tokio::fs::write(&target, bytes)
        .await
        .map_err(|e| format!("Could not install yt-dlp: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Could not make yt-dlp executable: {e}"))?;
    }

    Ok(status_for_dir(&dir).await)
}

pub async fn current_runtime_status(app: &tauri::AppHandle) -> Result<RuntimeStatus, String> {
    let dir = runtime_dir(app)?;
    Ok(status_for_dir(&dir).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ytdlp_asset_matches_platform() {
        let expected = if cfg!(target_os = "windows") {
            "yt-dlp.exe"
        } else if cfg!(target_os = "macos") {
            "yt-dlp_macos"
        } else {
            "yt-dlp_linux"
        };
        assert_eq!(ytdlp_asset_name(), expected);
    }

    #[test]
    fn ytdlp_url_is_official_release_asset() {
        assert_eq!(
            ytdlp_download_url(),
            format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", ytdlp_asset_name())
        );
    }
}
