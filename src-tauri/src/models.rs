use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub cover: Option<String>,
    pub duration_seconds: Option<f64>,
    pub source: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub synced_lyrics: Option<String>,
    pub plain_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub yt_dlp_version: Option<String>,
    pub deno_version: Option<String>,
    pub ffmpeg_version: Option<String>,
    pub yt_dlp_path: Option<String>,
    pub deno_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub task_id: String,
    pub percent: f64,
    pub speed: String,
    pub eta: String,
    pub item_title: String,
}
