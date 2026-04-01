use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const STARTUP_STATE_FILE_NAME: &str = "startup-state.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredStartupState {
    last_project_path: Option<String>,
}

fn startup_state_dir(app: &AppHandle) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_config_dir()
        .context("Failed to resolve NovelForge app config directory.")?;
    fs::create_dir_all(&directory)
        .with_context(|| format!("Failed to create {}", directory.display()))?;
    Ok(directory)
}

fn startup_state_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(startup_state_dir(app)?.join(STARTUP_STATE_FILE_NAME))
}

fn load_startup_state(app: &AppHandle) -> Result<StoredStartupState> {
    let path = startup_state_path(app)?;
    if !path.exists() {
        return Ok(StoredStartupState::default());
    }

    let raw =
        fs::read_to_string(&path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&raw).context("Failed to parse startup state JSON.")
}

fn save_startup_state(app: &AppHandle, state: &StoredStartupState) -> Result<()> {
    let path = startup_state_path(app)?;
    let raw = serde_json::to_string_pretty(state).context("Failed to serialize startup state.")?;
    fs::write(&path, raw).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

pub fn remember_last_project(app: &AppHandle, path: &Path) -> Result<()> {
    save_startup_state(
        app,
        &StoredStartupState {
            last_project_path: Some(path.to_string_lossy().into_owned()),
        },
    )
}

pub fn load_last_project(app: &AppHandle) -> Result<Option<PathBuf>> {
    Ok(load_startup_state(app)?.last_project_path.and_then(|path| {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    }))
}

pub fn clear_last_project(app: &AppHandle) -> Result<()> {
    save_startup_state(app, &StoredStartupState::default())
}
