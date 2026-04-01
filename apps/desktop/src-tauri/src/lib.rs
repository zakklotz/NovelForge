mod ai;
mod app_settings;
mod commands;
mod db;
mod models;
mod startup_state;
mod state;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|handle| {
            let new_project = MenuItem::with_id(
                handle,
                "file_new_project",
                "New Project...",
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let open_project = MenuItem::with_id(
                handle,
                "file_open_project",
                "Open Project...",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let close_project = MenuItem::with_id(
                handle,
                "file_close_project",
                "Close Project",
                true,
                Some("CmdOrCtrl+W"),
            )?;
            let settings = MenuItem::with_id(
                handle,
                "open_settings",
                "Settings",
                true,
                Some("CmdOrCtrl+,"),
            )?;
            let separator_one = PredefinedMenuItem::separator(handle)?;
            let separator_two = PredefinedMenuItem::separator(handle)?;
            let quit = PredefinedMenuItem::quit(handle, Some("Quit"))?;
            let file_menu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &new_project,
                    &open_project,
                    &close_project,
                    &separator_one,
                    &settings,
                    &separator_two,
                    &quit,
                ],
            )?;

            Menu::with_items(handle, &[&file_menu])
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "file_new_project" => {
                let _ = app.emit("novelforge://new-project", ());
            }
            "file_open_project" => {
                let _ = app.emit("novelforge://open-project", ());
            }
            "file_close_project" => {
                let _ = app.emit("novelforge://close-project", ());
            }
            "open_settings" => {
                let _ = app.emit("novelforge://open-settings", ());
            }
            _ => {}
        })
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::restore_last_project,
            commands::close_project,
            commands::get_project_snapshot,
            commands::set_project_metadata,
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
            commands::run_structured_ai_action,
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
