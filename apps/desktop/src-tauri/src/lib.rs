mod ai;
mod app_settings;
mod commands;
mod db;
mod models;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::get_project_snapshot,
            commands::save_chapter,
            commands::reorder_chapters,
            commands::save_scene,
            commands::move_scene,
            commands::save_manuscript,
            commands::save_character,
            commands::list_suggestions,
            commands::apply_suggestion,
            commands::dismiss_suggestion,
            commands::save_project_state,
            commands::sync_suggestions,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::list_recommended_models,
            commands::test_provider_connection,
            commands::run_scratchpad_chat,
            commands::apply_scratchpad_result,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("NovelForge");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NovelForge");
}
