use regex::Regex;
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::process::Command;

use crate::{models::Track, runtime};

#[derive(Debug, Clone)]
struct InnerTubeConfig {
    api_key: String,
    client_name: String,
    client_version: String,
    endpoint: String,
    homepage: String,
}

fn valid_video_id(value: &str) -> bool {
    value.len() == 11 && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn collect_named(node: &Value, key: &str, out: &mut Vec<Value>) {
    match node {
        Value::Object(map) => {
            if let Some(value) = map.get(key) {
                out.push(value.clone());
            }
            for value in map.values() {
                collect_named(value, key, out);
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_named(value, key, out);
            }
        }
        _ => {}
    }
}

fn first_run_text(value: &Value) -> String {
    value
        .get("runs")
        .and_then(Value::as_array)
        .and_then(|runs| runs.first())
        .and_then(|run| run.get("text"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn flex_text(renderer: &Value, index: usize) -> String {
    renderer
        .get("flexColumns")
        .and_then(Value::as_array)
        .and_then(|cols| cols.get(index))
        .and_then(|col| col.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|col| col.get("text"))
        .map(first_run_text)
        .unwrap_or_default()
}

fn last_thumbnail(value: &Value) -> Option<String> {
    let mut arrays = Vec::new();
    collect_named(value, "thumbnails", &mut arrays);
    arrays
        .into_iter()
        .filter_map(|entry| entry.as_array().cloned())
        .flat_map(|items| items.into_iter())
        .filter_map(|item| item.get("url").and_then(Value::as_str).map(ToOwned::to_owned))
        .last()
}

fn track_from_music_renderer(renderer: &Value) -> Option<Track> {
    let id = renderer.pointer("/playlistItemData/videoId")?.as_str()?.to_string();
    if !valid_video_id(&id) { return None; }
    let title = flex_text(renderer, 0);
    if title.is_empty() { return None; }
    let artist = {
        let value = flex_text(renderer, 1);
        if value.is_empty() { "Unknown artist".to_string() } else { value }
    };
    Some(Track {
        id,
        kind: "youtube".to_string(),
        title,
        artist,
        album: None,
        cover: last_thumbnail(renderer),
        duration_seconds: None,
        source: Some("YouTube Music".to_string()),
        path: None,
    })
}

fn parse_music_results(root: &Value) -> Vec<Track> {
    let mut renderers = Vec::new();
    collect_named(root, "musicResponsiveListItemRenderer", &mut renderers);
    renderers.iter().filter_map(track_from_music_renderer).collect()
}

fn track_from_web_renderer(renderer: &Value) -> Option<Track> {
    let id = renderer.get("videoId")?.as_str()?.to_string();
    if !valid_video_id(&id) { return None; }
    let title = renderer.get("title").map(first_run_text).unwrap_or_default();
    if title.is_empty() { return None; }
    let artist = renderer
        .get("ownerText")
        .map(first_run_text)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "Unknown artist".to_string());
    let duration_seconds = renderer
        .get("lengthSeconds")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<f64>().ok());
    Some(Track {
        id,
        kind: "youtube".to_string(),
        title,
        artist,
        album: None,
        cover: last_thumbnail(renderer),
        duration_seconds,
        source: Some("YouTube".to_string()),
        path: None,
    })
}

fn parse_web_results(root: &Value) -> Vec<Track> {
    let mut renderers = Vec::new();
    collect_named(root, "videoRenderer", &mut renderers);
    renderers.iter().filter_map(track_from_web_renderer).collect()
}

fn client_settings(client: &str) -> Result<(&'static str, &'static str, &'static str), String> {
    match client {
        "music" => Ok(("https://music.youtube.com/", "https://music.youtube.com/youtubei/v1/search", "WEB_REMIX")),
        "web" => Ok(("https://www.youtube.com/", "https://www.youtube.com/youtubei/v1/search", "WEB")),
        _ => Err("Unsupported InnerTube client".to_string()),
    }
}

async fn fetch_innertube_config(client: &str) -> Result<InnerTubeConfig, String> {
    let (homepage, endpoint, client_name) = client_settings(client)?;
    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Frxe-Desktop/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let html = http
        .get(homepage)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Could not open YouTube provider: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube provider returned an error: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Could not read YouTube provider config: {e}"))?;

    let api_re = Regex::new(r#"\"INNERTUBE_API_KEY\"\s*:\s*\"([^\"]+)\""#).map_err(|e| e.to_string())?;
    let version_re = Regex::new(r#"\"INNERTUBE_CLIENT_VERSION\"\s*:\s*\"([^\"]+)\""#).map_err(|e| e.to_string())?;
    let api_key = api_re
        .captures(&html)
        .and_then(|m| m.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| "YouTube provider config did not include an API key".to_string())?;
    let client_version = version_re
        .captures(&html)
        .and_then(|m| m.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| "YouTube provider config did not include a client version".to_string())?;

    Ok(InnerTubeConfig {
        api_key,
        client_name: client_name.to_string(),
        client_version,
        endpoint: endpoint.to_string(),
        homepage: homepage.to_string(),
    })
}

#[tauri::command]
pub async fn innertube_search(query: String, client: String) -> Result<Vec<Track>, String> {
    let query = query.trim();
    if query.is_empty() { return Ok(Vec::new()); }
    let cfg = fetch_innertube_config(&client).await?;
    let url = format!("{}?key={}&prettyPrint=false", cfg.endpoint, urlencoding::encode(&cfg.api_key));
    let body = json!({
        "context": {
            "client": {
                "clientName": cfg.client_name,
                "clientVersion": cfg.client_version,
                "hl": "en"
            }
        },
        "query": query
    });
    let response: Value = reqwest::Client::new()
        .post(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Frxe-Desktop/0.1.0")
        .header("Referer", &cfg.homepage)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("YouTube search failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube search failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Could not parse YouTube search results: {e}"))?;

    Ok(if client == "music" { parse_music_results(&response) } else { parse_web_results(&response) })
}

#[tauri::command]
pub async fn ytdlp_search(app: AppHandle, query: String) -> Result<Vec<Track>, String> {
    let query = query.trim();
    if query.is_empty() { return Ok(Vec::new()); }
    let runtime_dir = runtime::runtime_dir(&app)?;
    let ytdlp = runtime::resolve_ytdlp(&runtime_dir)?;
    let output = Command::new(&ytdlp)
        .args(["--no-warnings", "--flat-playlist", "--dump-single-json", &format!("ytsearch20:{query}")])
        .output()
        .await
        .map_err(|e| format!("Could not launch yt-dlp search: {e}"))?;
    if !output.status.success() {
        return Err(format!("yt-dlp search failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let root: Value = serde_json::from_slice(&output.stdout).map_err(|e| format!("Could not parse yt-dlp search: {e}"))?;
    let mut tracks = Vec::new();
    for item in root.get("entries").and_then(Value::as_array).into_iter().flatten() {
        let Some(id) = item.get("id").and_then(Value::as_str) else { continue };
        if !valid_video_id(id) { continue; }
        let title = item.get("title").and_then(Value::as_str).unwrap_or("Unknown track").to_string();
        let artist = item.get("channel").or_else(|| item.get("uploader")).and_then(Value::as_str).unwrap_or("Unknown artist").to_string();
        let cover = item.get("thumbnail").and_then(Value::as_str).map(ToOwned::to_owned);
        let duration_seconds = item.get("duration").and_then(Value::as_f64);
        tracks.push(Track {
            id: id.to_string(),
            kind: "youtube".to_string(),
            title,
            artist,
            album: None,
            cover,
            duration_seconds,
            source: Some("YouTube".to_string()),
            path: None,
        });
    }
    Ok(tracks)
}

#[tauri::command]
pub async fn resolve_stream_url(app: AppHandle, video_id: String) -> Result<String, String> {
    if !valid_video_id(&video_id) {
        return Err("Invalid YouTube video id".to_string());
    }
    let runtime_dir = runtime::runtime_dir(&app)?;
    let ytdlp = runtime::resolve_ytdlp(&runtime_dir)?;
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let output = Command::new(&ytdlp)
        .args(["--no-warnings", "--no-playlist", "-f", "bestaudio/best", "-g", &url])
        .output()
        .await
        .map_err(|e| format!("Could not launch yt-dlp: {e}"))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("yt-dlp could not resolve this track: {error}"));
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("https://") || line.starts_with("http://"))
        .map(ToOwned::to_owned)
        .ok_or_else(|| "yt-dlp returned no playable audio URL".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_music_track() {
        let json: Value = serde_json::from_str(include_str!("../tests/fixtures/music-search.json")).unwrap();
        let tracks = parse_music_results(&json);
        assert_eq!(tracks[0].id, "abcdefghijk");
        assert_eq!(tracks[0].source.as_deref(), Some("YouTube Music"));
    }

    #[test]
    fn parses_web_track() {
        let json: Value = serde_json::from_str(include_str!("../tests/fixtures/web-search.json")).unwrap();
        let tracks = parse_web_results(&json);
        assert_eq!(tracks[0].source.as_deref(), Some("YouTube"));
    }

    #[test]
    fn rejects_invalid_video_ids() {
        assert!(valid_video_id("abcdefghijk"));
        assert!(!valid_video_id("too-short"));
        assert!(!valid_video_id("bad id!!!!!"));
    }
}
