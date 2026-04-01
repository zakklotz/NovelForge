use std::path::PathBuf;

use anyhow::{anyhow, Result};
use tauri::{AppHandle, State};

use crate::models::{
    AppSettings, ApplyScratchpadResultInput, ApplyScratchpadResultOutput, ApplySuggestionInput,
    CreateProjectInput, DismissSuggestionInput, MoveSceneInput, OpenProjectInput, ProjectSnapshot,
    ProjectState, ProviderConnectionResult, RecommendedModel, RunScratchpadChatInput,
    RunStructuredAIActionInput, SaveAppSettingsInput, SaveChapterInput, SaveCharacterInput,
    SaveManuscriptInput, SaveProjectMetadataInput, SaveSceneInput, ScratchpadChatResponse,
    StructuredAIResponse, Suggestion, SyncSuggestionsInput, TestProviderConnectionInput,
};
use crate::state::AppState;
use crate::{ai, app_settings, db, startup_state};

fn resolve_current_path(state: &State<'_, AppState>) -> Result<PathBuf> {
    state
        .current_project_path
        .lock()
        .map_err(|_| anyhow!("Failed to lock project state."))?
        .clone()
        .ok_or_else(|| anyhow!("Open or create a NovelForge project first."))
}

fn store_current_path(state: &State<'_, AppState>, path: PathBuf) -> Result<()> {
    let mut guard = state
        .current_project_path
        .lock()
        .map_err(|_| anyhow!("Failed to lock project state."))?;
    *guard = Some(path);
    Ok(())
}

fn clear_current_path(state: &State<'_, AppState>) -> Result<()> {
    let mut guard = state
        .current_project_path
        .lock()
        .map_err(|_| anyhow!("Failed to lock project state."))?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> Result<ProjectSnapshot, String> {
    let (path, snapshot) = db::create_project(input).map_err(|error| error.to_string())?;
    store_current_path(&state, path.clone()).map_err(|error| error.to_string())?;
    startup_state::remember_last_project(&app, &path).map_err(|error| error.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
pub fn open_project(
    app: AppHandle,
    state: State<'_, AppState>,
    input: OpenProjectInput,
) -> Result<ProjectSnapshot, String> {
    let (path, snapshot) = db::open_project(input).map_err(|error| error.to_string())?;
    store_current_path(&state, path.clone()).map_err(|error| error.to_string())?;
    startup_state::remember_last_project(&app, &path).map_err(|error| error.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
pub fn restore_last_project(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<ProjectSnapshot>, String> {
    let Some(path) = startup_state::load_last_project(&app).map_err(|error| error.to_string())?
    else {
        clear_current_path(&state).map_err(|error| error.to_string())?;
        return Ok(None);
    };

    if !path.exists() {
        startup_state::clear_last_project(&app).map_err(|error| error.to_string())?;
        clear_current_path(&state).map_err(|error| error.to_string())?;
        return Ok(None);
    }

    match db::open_project(OpenProjectInput {
        path: path.to_string_lossy().into_owned(),
    }) {
        Ok((resolved_path, snapshot)) => {
            store_current_path(&state, resolved_path.clone()).map_err(|error| error.to_string())?;
            startup_state::remember_last_project(&app, &resolved_path)
                .map_err(|error| error.to_string())?;
            Ok(Some(snapshot))
        }
        Err(_) => {
            startup_state::clear_last_project(&app).map_err(|error| error.to_string())?;
            clear_current_path(&state).map_err(|error| error.to_string())?;
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn close_project(state: State<'_, AppState>) -> Result<(), String> {
    clear_current_path(&state).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_project_snapshot(state: State<'_, AppState>) -> Result<ProjectSnapshot, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::get_snapshot(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_project_metadata(
    state: State<'_, AppState>,
    input: SaveProjectMetadataInput,
) -> Result<crate::models::Project, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::save_project_metadata(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_chapter(
    state: State<'_, AppState>,
    input: SaveChapterInput,
) -> Result<crate::models::Chapter, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::save_chapter(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reorder_chapters(
    state: State<'_, AppState>,
    project_id: String,
    chapter_ids: Vec<String>,
) -> Result<(), String> {
    let _ = project_id;
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::reorder_chapters(&path, &chapter_ids).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_scene(
    state: State<'_, AppState>,
    input: SaveSceneInput,
) -> Result<crate::models::Scene, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::save_scene(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn move_scene(
    state: State<'_, AppState>,
    input: MoveSceneInput,
) -> Result<crate::models::Scene, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::move_scene(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_manuscript(
    state: State<'_, AppState>,
    input: SaveManuscriptInput,
) -> Result<crate::models::Scene, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::save_manuscript(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_character(
    state: State<'_, AppState>,
    input: SaveCharacterInput,
) -> Result<crate::models::Character, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::save_character(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_suggestions(state: State<'_, AppState>) -> Result<Vec<Suggestion>, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::list_suggestions(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_suggestion(
    state: State<'_, AppState>,
    input: ApplySuggestionInput,
) -> Result<(), String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::apply_suggestion(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn dismiss_suggestion(
    state: State<'_, AppState>,
    input: DismissSuggestionInput,
) -> Result<(), String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::dismiss_suggestion(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_project_state(
    state: State<'_, AppState>,
    project_state: ProjectState,
) -> Result<ProjectState, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::save_project_state(&path, project_state).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sync_suggestions(
    state: State<'_, AppState>,
    input: SyncSuggestionsInput,
) -> Result<Vec<Suggestion>, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::sync_suggestions(&path, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    app_settings::get_app_settings(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_app_settings(
    app: AppHandle,
    input: SaveAppSettingsInput,
) -> Result<AppSettings, String> {
    app_settings::save_app_settings(&app, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_recommended_models(
    provider_id: Option<String>,
) -> Result<Vec<RecommendedModel>, String> {
    Ok(ai::list_recommended_models(provider_id))
}

#[tauri::command]
pub async fn test_provider_connection(
    app: AppHandle,
    input: TestProviderConnectionInput,
) -> Result<ProviderConnectionResult, String> {
    ai::test_provider_connection(&app, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn run_scratchpad_chat(
    state: State<'_, AppState>,
    app: AppHandle,
    input: RunScratchpadChatInput,
) -> Result<ScratchpadChatResponse, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    let snapshot = db::get_snapshot(&path).map_err(|error| error.to_string())?;
    if snapshot.project.id != input.project_id {
        return Err("Scratchpad request does not match the currently open project.".to_string());
    }
    ai::run_scratchpad_chat(&app, &snapshot, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn run_structured_ai_action(
    state: State<'_, AppState>,
    app: AppHandle,
    input: RunStructuredAIActionInput,
) -> Result<StructuredAIResponse, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    let snapshot = db::get_snapshot(&path).map_err(|error| error.to_string())?;
    if snapshot.project.id != input.project_id {
        return Err("Structured AI request does not match the currently open project.".to_string());
    }
    ai::run_structured_ai_action(&app, &snapshot, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_scratchpad_result(
    state: State<'_, AppState>,
    input: ApplyScratchpadResultInput,
) -> Result<ApplyScratchpadResultOutput, String> {
    let path = resolve_current_path(&state).map_err(|error| error.to_string())?;
    db::apply_scratchpad_result(&path, input).map_err(|error| error.to_string())
}
