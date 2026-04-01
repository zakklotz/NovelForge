use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub current_project_path: Mutex<Option<PathBuf>>,
}
