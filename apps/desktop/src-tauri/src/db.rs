use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use rusqlite::{params, types::Type, Connection, OptionalExtension, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::json;
use uuid::Uuid;

use crate::models::{
    ApplyScratchpadResultInput, ApplyScratchpadResultOutput, ApplySuggestionInput, AutosaveState,
    Chapter, Character, CreateProjectInput, DismissSuggestionInput, DomainObjectRef,
    MoveSceneInput, OpenProjectInput, PanelLayout, Project, ProjectSettings, ProjectSnapshot,
    ProjectState, Relationship, SaveChapterInput, SaveCharacterInput, SaveManuscriptInput,
    SaveProjectMetadataInput, SaveSceneInput, Scene, SceneProposal, Suggestion,
    SuggestionEvidenceRef, SyncSuggestionsInput, ViewFilters,
};

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/0001_initial.sql")),
    (2, include_str!("../migrations/0002_scene_beat_outline.sql")),
    (
        3,
        include_str!("../migrations/0003_project_story_brief.sql"),
    ),
];

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn to_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).context("Failed to serialize JSON field.")
}

fn from_row_json<T: DeserializeOwned>(value: String, column: usize) -> rusqlite::Result<T> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, Type::Text, Box::new(error))
    })
}

fn boxed_row_error(error: anyhow::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        Type::Text,
        Box::new(io::Error::other(error.to_string())),
    )
}

fn optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|raw| if raw.is_empty() { None } else { Some(raw) })
}

fn open_connection(path: &Path) -> Result<Connection> {
    let connection = Connection::open(path)
        .with_context(|| format!("Failed to open project database at {}", path.display()))?;
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
    Ok(connection)
}

pub fn ensure_project_parent(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent directory {}", parent.display()))?;
    }

    Ok(())
}

fn latest_schema_version() -> i64 {
    MIGRATIONS.last().map(|(version, _)| *version).unwrap_or(0)
}

fn current_schema_version(connection: &Connection) -> Result<i64> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .context("Failed to read SQLite user_version.")
}

pub fn migrate(connection: &mut Connection) -> Result<()> {
    let current_version = current_schema_version(connection)?;
    let latest_version = latest_schema_version();

    if current_version > latest_version {
        return Err(anyhow!(
            "Project schema version {} is newer than this app supports ({}).",
            current_version,
            latest_version
        ));
    }

    for (version, sql) in MIGRATIONS {
        if *version <= current_version {
            continue;
        }

        let transaction = connection.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.pragma_update(None, "user_version", version)?;
        transaction.commit()?;
    }

    connection.execute(
        "UPDATE project SET schema_version = ?1 WHERE schema_version < ?1",
        params![latest_version],
    )?;

    Ok(())
}

fn create_default_project_state(project_id: &str) -> ProjectState {
    ProjectState {
        project_id: project_id.to_string(),
        last_route: "/chapters".to_string(),
        open_scene_ids: vec![],
        selected_ids: vec![],
        view_filters: ViewFilters {
            active_chapter_id: None,
            search_text: String::new(),
            scene_character_id: None,
            scene_continuity_tag: None,
            suggestion_status: None,
        },
        panel_layout: PanelLayout {
            chapters_inspector_width: 360,
            scene_left_width: 320,
            scene_right_width: 360,
        },
        autosave_state: AutosaveState {
            is_saving: false,
            last_saved_at: None,
        },
        analysis_queue: vec![],
        last_full_scan_at: None,
    }
}

fn insert_project_state(transaction: &Transaction<'_>, state: &ProjectState) -> Result<()> {
    transaction.execute(
        r#"
        INSERT INTO project_state (
          project_id,
          last_route,
          open_scene_ids_json,
          selected_ids_json,
          view_filters_json,
          panel_layout_json,
          autosave_state_json,
          analysis_queue_json,
          last_full_scan_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        params![
            state.project_id,
            state.last_route,
            to_json(&state.open_scene_ids)?,
            to_json(&state.selected_ids)?,
            to_json(&state.view_filters)?,
            to_json(&state.panel_layout)?,
            to_json(&state.autosave_state)?,
            to_json(&state.analysis_queue)?,
            state.last_full_scan_at,
        ],
    )?;

    Ok(())
}

fn upsert_scene_relations(transaction: &Transaction<'_>, scene: &SaveSceneInput) -> Result<()> {
    transaction.execute(
        "DELETE FROM scene_characters WHERE scene_id = ?1",
        params![scene.id],
    )?;
    transaction.execute(
        "DELETE FROM scene_dependencies WHERE scene_id = ?1",
        params![scene.id],
    )?;
    transaction.execute(
        "DELETE FROM scene_continuity_tags WHERE scene_id = ?1",
        params![scene.id],
    )?;

    for (index, character_id) in scene.involved_character_ids.iter().enumerate() {
        transaction.execute(
            "INSERT INTO scene_characters (scene_id, character_id, position) VALUES (?1, ?2, ?3)",
            params![scene.id, character_id, index as i64],
        )?;
    }

    for (index, dependency_scene_id) in scene.dependency_scene_ids.iter().enumerate() {
        transaction.execute(
            "INSERT INTO scene_dependencies (scene_id, dependency_scene_id, position) VALUES (?1, ?2, ?3)",
            params![scene.id, dependency_scene_id, index as i64],
        )?;
    }

    for (index, tag) in scene.continuity_tags.iter().enumerate() {
        transaction.execute(
            "INSERT INTO scene_continuity_tags (scene_id, tag, position) VALUES (?1, ?2, ?3)",
            params![scene.id, tag, index as i64],
        )?;
    }

    Ok(())
}

fn upsert_character_relationships(
    transaction: &Transaction<'_>,
    character: &SaveCharacterInput,
) -> Result<()> {
    transaction.execute(
        "DELETE FROM character_relationships WHERE character_id = ?1",
        params![character.id],
    )?;

    for (index, relationship) in character.relationships.iter().enumerate() {
        transaction.execute(
            "INSERT INTO character_relationships (character_id, related_character_id, summary, position) VALUES (?1, ?2, ?3, ?4)",
            params![character.id, relationship.character_id, relationship.summary, index as i64],
        )?;
    }

    Ok(())
}

fn load_string_list(connection: &Connection, query: &str, id: &str) -> Result<Vec<String>> {
    let mut statement = connection.prepare(query)?;
    let rows = statement.query_map(params![id], |row| row.get::<_, String>(0))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to load string list.")
}

fn load_relationships(connection: &Connection, character_id: &str) -> Result<Vec<Relationship>> {
    let mut statement = connection.prepare(
        "SELECT related_character_id, summary FROM character_relationships WHERE character_id = ?1 ORDER BY position ASC",
    )?;
    let rows = statement.query_map(params![character_id], |row| {
        Ok(Relationship {
            character_id: row.get(0)?,
            summary: row.get(1)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to load character relationships.")
}

fn load_project(connection: &Connection) -> Result<Project> {
    connection
        .query_row(
            "SELECT id, title, logline, premise, central_conflict, thematic_intent, ending_direction, genre, tone, audience_notes, schema_version, settings_json, created_at, updated_at, last_opened_at FROM project LIMIT 1",
            [],
            |row| {
                let settings_json: String = row.get(11)?;
                Ok(Project {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    logline: row.get(2)?,
                    premise: row.get(3)?,
                    central_conflict: row.get(4)?,
                    thematic_intent: row.get(5)?,
                    ending_direction: row.get(6)?,
                    genre: row.get(7)?,
                    tone: row.get(8)?,
                    audience_notes: row.get(9)?,
                    schema_version: row.get(10)?,
                    settings: from_row_json(settings_json, 11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    last_opened_at: row.get(14)?,
                })
            },
        )
        .context("Project file does not contain a NovelForge project.")
}

fn load_chapters(connection: &Connection) -> Result<Vec<Chapter>> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, title, summary, purpose, major_events_json, emotional_movement, character_focus_ids_json, setup_payoff_notes, order_index, created_at, updated_at FROM chapters ORDER BY order_index ASC, created_at ASC",
    )?;

    let rows = statement.query_map([], |row| {
        let major_events_json: String = row.get(5)?;
        let character_focus_ids_json: String = row.get(7)?;

        Ok(Chapter {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            summary: row.get(3)?,
            purpose: row.get(4)?,
            major_events: from_row_json(major_events_json, 5)?,
            emotional_movement: row.get(6)?,
            character_focus_ids: from_row_json(character_focus_ids_json, 7)?,
            setup_payoff_notes: row.get(8)?,
            order_index: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to load chapters.")
}

fn load_scenes(connection: &Connection) -> Result<Vec<Scene>> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, chapter_id, order_index, title, summary, purpose, beat_outline, conflict, outcome, pov_character_id, location, time_label, manuscript_text, created_at, updated_at FROM scenes ORDER BY COALESCE(chapter_id, id) ASC, order_index ASC, created_at ASC",
    )?;

    let rows = statement.query_map([], |row| {
        let id: String = row.get(0)?;

        Ok(Scene {
            id: id.clone(),
            project_id: row.get(1)?,
            chapter_id: row.get(2)?,
            order_index: row.get(3)?,
            title: row.get(4)?,
            summary: row.get(5)?,
            purpose: row.get(6)?,
            beat_outline: row.get(7)?,
            conflict: row.get(8)?,
            outcome: row.get(9)?,
            pov_character_id: row.get(10)?,
            location: row.get(11)?,
            time_label: row.get(12)?,
            involved_character_ids: load_string_list(
                connection,
                "SELECT character_id FROM scene_characters WHERE scene_id = ?1 ORDER BY position ASC",
                &id,
            )
            .map_err(boxed_row_error)?,
            continuity_tags: load_string_list(
                connection,
                "SELECT tag FROM scene_continuity_tags WHERE scene_id = ?1 ORDER BY position ASC",
                &id,
            )
            .map_err(boxed_row_error)?,
            dependency_scene_ids: load_string_list(
                connection,
                "SELECT dependency_scene_id FROM scene_dependencies WHERE scene_id = ?1 ORDER BY position ASC",
                &id,
            )
            .map_err(boxed_row_error)?,
            manuscript_text: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to load scenes.")
}

fn load_characters(connection: &Connection) -> Result<Vec<Character>> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, name, role, personality_traits_json, motivations, fears, worldview, speaking_style, vocabulary_tendencies, speech_rhythm, emotional_baseline, secrets, arc_direction, contradictions, created_at, updated_at FROM characters ORDER BY name ASC",
    )?;

    let rows = statement.query_map([], |row| {
        let id: String = row.get(0)?;
        let personality_traits_json: String = row.get(4)?;

        Ok(Character {
            id: id.clone(),
            project_id: row.get(1)?,
            name: row.get(2)?,
            role: row.get(3)?,
            personality_traits: from_row_json(personality_traits_json, 4)?,
            motivations: row.get(5)?,
            fears: row.get(6)?,
            worldview: row.get(7)?,
            speaking_style: row.get(8)?,
            vocabulary_tendencies: row.get(9)?,
            speech_rhythm: row.get(10)?,
            emotional_baseline: row.get(11)?,
            relationships: load_relationships(connection, &id).map_err(boxed_row_error)?,
            secrets: row.get(12)?,
            arc_direction: row.get(13)?,
            contradictions: row.get(14)?,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to load characters.")
}

fn load_suggestions(connection: &Connection) -> Result<Vec<Suggestion>> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, type, trigger_event, source_kind, source_id, source_title, impacted_kind, impacted_id, impacted_title, severity, title, rationale, evidence_refs_json, proposed_action, status, fingerprint, created_at, updated_at FROM suggestions ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'applied' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END, updated_at DESC",
    )?;

    let rows = statement.query_map([], |row| {
        let evidence_refs_json: String = row.get(13)?;

        Ok(Suggestion {
            id: row.get(0)?,
            project_id: row.get(1)?,
            r#type: row.get(2)?,
            trigger_event: row.get(3)?,
            source_object: DomainObjectRef {
                kind: row.get(4)?,
                id: row.get(5)?,
                title: row.get(6)?,
            },
            impacted_object: DomainObjectRef {
                kind: row.get(7)?,
                id: row.get(8)?,
                title: row.get(9)?,
            },
            severity: row.get(10)?,
            title: row.get(11)?,
            rationale: row.get(12)?,
            evidence_refs: from_row_json::<Vec<SuggestionEvidenceRef>>(evidence_refs_json, 13)?,
            proposed_action: row.get(14)?,
            status: row.get(15)?,
            fingerprint: row.get(16)?,
            created_at: row.get(17)?,
            updated_at: row.get(18)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to load suggestions.")
}

fn load_project_state(connection: &Connection, project_id: &str) -> Result<ProjectState> {
    connection
        .query_row(
            "SELECT project_id, last_route, open_scene_ids_json, selected_ids_json, view_filters_json, panel_layout_json, autosave_state_json, analysis_queue_json, last_full_scan_at FROM project_state WHERE project_id = ?1",
            params![project_id],
            |row| {
                let open_scene_ids_json: String = row.get(2)?;
                let selected_ids_json: String = row.get(3)?;
                let view_filters_json: String = row.get(4)?;
                let panel_layout_json: String = row.get(5)?;
                let autosave_state_json: String = row.get(6)?;
                let analysis_queue_json: String = row.get(7)?;

                Ok(ProjectState {
                    project_id: row.get(0)?,
                    last_route: row.get(1)?,
                    open_scene_ids: from_row_json(open_scene_ids_json, 2)?,
                    selected_ids: from_row_json(selected_ids_json, 3)?,
                    view_filters: from_row_json(view_filters_json, 4)?,
                    panel_layout: from_row_json(panel_layout_json, 5)?,
                    autosave_state: from_row_json(autosave_state_json, 6)?,
                    analysis_queue: from_row_json(analysis_queue_json, 7)?,
                    last_full_scan_at: row.get(8)?,
                })
            },
        )
        .context("Failed to load project state.")
}

pub fn load_snapshot(connection: &Connection) -> Result<ProjectSnapshot> {
    let project = load_project(connection)?;
    let project_state = load_project_state(connection, &project.id)?;

    Ok(ProjectSnapshot {
        project,
        chapters: load_chapters(connection)?,
        scenes: load_scenes(connection)?,
        characters: load_characters(connection)?,
        suggestions: load_suggestions(connection)?,
        project_state,
    })
}

pub fn create_project(input: CreateProjectInput) -> Result<(PathBuf, ProjectSnapshot)> {
    let path = PathBuf::from(input.path);

    if path.exists() {
        return Err(anyhow!(
            "A file already exists at {}. Choose a new project file.",
            path.display()
        ));
    }

    ensure_project_parent(&path)?;
    let mut connection = open_connection(&path)?;
    migrate(&mut connection)?;

    let transaction = connection.transaction()?;
    let timestamp = now_iso();
    let project_id = Uuid::new_v4().to_string();
    let settings = ProjectSettings {
        autosave_interval_ms: 1500,
        auto_analyze: true,
        editor_font_scale: 1.0,
    };

    transaction.execute(
        "INSERT INTO project (
            id,
            title,
            logline,
            premise,
            central_conflict,
            thematic_intent,
            ending_direction,
            genre,
            tone,
            audience_notes,
            schema_version,
            settings_json,
            created_at,
            updated_at,
            last_opened_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            project_id,
            input.title,
            input.logline,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            latest_schema_version(),
            to_json(&settings)?,
            timestamp,
            timestamp,
            timestamp,
        ],
    )?;

    let project_state = create_default_project_state(&project_id);
    insert_project_state(&transaction, &project_state)?;
    transaction.commit()?;

    let snapshot = load_snapshot(&connection)?;
    Ok((path, snapshot))
}

pub fn open_project(input: OpenProjectInput) -> Result<(PathBuf, ProjectSnapshot)> {
    let path = PathBuf::from(input.path);
    let mut connection = open_connection(&path)?;
    migrate(&mut connection)?;

    let project_id: Option<String> = connection
        .query_row("SELECT id FROM project LIMIT 1", [], |row| row.get(0))
        .optional()?;

    if let Some(project_id) = project_id {
        let timestamp = now_iso();
        connection.execute(
            "UPDATE project SET last_opened_at = ?1, updated_at = updated_at WHERE id = ?2",
            params![timestamp, project_id],
        )?;
        let snapshot = load_snapshot(&connection)?;
        Ok((path, snapshot))
    } else {
        Err(anyhow!(
            "This file is not a valid NovelForge project database."
        ))
    }
}

pub fn get_snapshot(path: &Path) -> Result<ProjectSnapshot> {
    let connection = open_connection(path)?;
    load_snapshot(&connection)
}

pub fn save_project_metadata(path: &Path, input: SaveProjectMetadataInput) -> Result<Project> {
    if input.title.trim().is_empty() {
        return Err(anyhow!("Project title cannot be empty."));
    }

    let connection = open_connection(path)?;
    let updated_at = now_iso();
    let rows_updated = connection.execute(
        r#"
        UPDATE project
        SET
          title = ?1,
          logline = ?2,
          premise = ?3,
          central_conflict = ?4,
          thematic_intent = ?5,
          ending_direction = ?6,
          genre = ?7,
          tone = ?8,
          audience_notes = ?9,
          updated_at = ?10
        WHERE id = ?11
        "#,
        params![
            input.title.trim(),
            input.logline,
            input.premise,
            input.central_conflict,
            input.thematic_intent,
            input.ending_direction,
            input.genre,
            input.tone,
            input.audience_notes,
            updated_at,
            input.id,
        ],
    )?;

    if rows_updated == 0 {
        return Err(anyhow!("Project metadata could not be saved."));
    }

    load_project(&connection)
}

fn normalize_lookup_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn scene_count_in_bucket(
    transaction: &Transaction<'_>,
    chapter_id: Option<&str>,
    excluded_scene_id: Option<&str>,
) -> Result<i64> {
    let excluded_scene_id = excluded_scene_id.unwrap_or("");
    transaction
        .query_row(
            "SELECT COUNT(*) FROM scenes WHERE ((chapter_id IS NULL AND ?1 IS NULL) OR chapter_id = ?1) AND (?2 = '' OR id != ?2)",
            params![chapter_id, excluded_scene_id],
            |row| row.get(0),
        )
        .context("Failed to count scenes in bucket.")
}

fn next_scene_order_index(transaction: &Transaction<'_>, chapter_id: Option<&str>) -> Result<i64> {
    scene_count_in_bucket(transaction, chapter_id, None)
}

fn remember_lookup_entry(lookup: &mut HashMap<String, String>, id: &str, primary_label: &str) {
    lookup.insert(normalize_lookup_key(id), id.to_string());
    if !primary_label.trim().is_empty() {
        lookup.insert(normalize_lookup_key(primary_label), id.to_string());
    }
}

fn resolve_lookup_reference(lookup: &HashMap<String, String>, raw_value: &str) -> Option<String> {
    let key = normalize_lookup_key(raw_value);
    lookup.get(&key).cloned()
}

fn build_character_lookup(snapshot: &ProjectSnapshot) -> HashMap<String, String> {
    let mut lookup = HashMap::new();
    for character in &snapshot.characters {
        remember_lookup_entry(&mut lookup, &character.id, &character.name);
    }
    lookup
}

fn build_chapter_lookup(snapshot: &ProjectSnapshot) -> HashMap<String, String> {
    let mut lookup = HashMap::new();
    for chapter in &snapshot.chapters {
        remember_lookup_entry(&mut lookup, &chapter.id, &chapter.title);
    }
    lookup
}

fn build_scene_lookup(snapshot: &ProjectSnapshot) -> HashMap<String, String> {
    let mut lookup = HashMap::new();
    for scene in &snapshot.scenes {
        remember_lookup_entry(&mut lookup, &scene.id, &scene.title);
    }
    lookup
}

fn load_scene_position(
    transaction: &Transaction<'_>,
    scene_id: &str,
) -> Result<(Option<String>, i64)> {
    transaction
        .query_row(
            "SELECT chapter_id, order_index FROM scenes WHERE id = ?1",
            params![scene_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .context("Scene not found.")
}

fn close_scene_gap(
    transaction: &Transaction<'_>,
    scene_id: &str,
    chapter_id: Option<&str>,
    removed_order_index: i64,
) -> Result<()> {
    transaction.execute(
        "UPDATE scenes SET order_index = order_index - 1, updated_at = ?1 WHERE id != ?2 AND ((chapter_id IS NULL AND ?3 IS NULL) OR chapter_id = ?3) AND order_index > ?4",
        params![now_iso(), scene_id, chapter_id, removed_order_index],
    )?;
    Ok(())
}

fn make_room_for_scene(
    transaction: &Transaction<'_>,
    scene_id: &str,
    chapter_id: Option<&str>,
    target_index: i64,
) -> Result<()> {
    transaction.execute(
        "UPDATE scenes SET order_index = order_index + 1, updated_at = ?1 WHERE id != ?2 AND ((chapter_id IS NULL AND ?3 IS NULL) OR chapter_id = ?3) AND order_index >= ?4",
        params![now_iso(), scene_id, chapter_id, target_index],
    )?;
    Ok(())
}

fn move_scene_within_transaction(
    transaction: &Transaction<'_>,
    scene_id: &str,
    target_chapter_id: Option<String>,
    requested_target_index: i64,
) -> Result<i64> {
    let (current_chapter_id, current_order_index) = load_scene_position(transaction, scene_id)?;
    let max_target_index =
        scene_count_in_bucket(transaction, target_chapter_id.as_deref(), Some(scene_id))?;
    let mut target_index = requested_target_index.clamp(0, max_target_index);

    if current_chapter_id == target_chapter_id && target_index > current_order_index {
        target_index -= 1;
    }

    close_scene_gap(
        transaction,
        scene_id,
        current_chapter_id.as_deref(),
        current_order_index,
    )?;
    make_room_for_scene(
        transaction,
        scene_id,
        target_chapter_id.as_deref(),
        target_index,
    )?;

    transaction.execute(
        "UPDATE scenes SET chapter_id = ?1, order_index = ?2, updated_at = ?3 WHERE id = ?4",
        params![
            optional_string(target_chapter_id.clone()),
            target_index,
            now_iso(),
            scene_id
        ],
    )?;

    Ok(target_index)
}

fn resolve_character_ids(
    values: &[String],
    character_lookup: &HashMap<String, String>,
) -> Vec<String> {
    values
        .iter()
        .filter_map(|value| {
            resolve_lookup_reference(character_lookup, value).or_else(|| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
        })
        .collect()
}

fn resolve_optional_character_id(
    value: &Option<String>,
    character_lookup: &HashMap<String, String>,
) -> Option<String> {
    value.as_ref().and_then(|value| {
        resolve_lookup_reference(character_lookup, value).or_else(|| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
    })
}

fn resolve_scene_ids(values: &[String], scene_lookup: &HashMap<String, String>) -> Vec<String> {
    values
        .iter()
        .filter_map(|value| resolve_lookup_reference(scene_lookup, value))
        .collect()
}

fn resolve_chapter_id(
    proposal: &SceneProposal,
    chapter_lookup: &HashMap<String, String>,
    fallback: Option<String>,
) -> Option<String> {
    if let Some(chapter_id) = &proposal.chapter_id {
        if let Some(resolved) = resolve_lookup_reference(chapter_lookup, chapter_id) {
            return Some(resolved);
        }
        let trimmed = chapter_id.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(chapter_title_hint) = &proposal.chapter_title_hint {
        if let Some(resolved) = resolve_lookup_reference(chapter_lookup, chapter_title_hint) {
            return Some(resolved);
        }
    }

    fallback
}

pub fn apply_scratchpad_result(
    path: &Path,
    input: ApplyScratchpadResultInput,
) -> Result<ApplyScratchpadResultOutput> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;
    let snapshot = load_snapshot(&transaction)?;

    if snapshot.project.id != input.project_id {
        return Err(anyhow!(
            "Scratchpad result belongs to project {} but {} is currently open.",
            input.project_id,
            snapshot.project.id
        ));
    }

    let mut character_lookup = build_character_lookup(&snapshot);
    let mut chapter_lookup = build_chapter_lookup(&snapshot);
    let mut scene_lookup = build_scene_lookup(&snapshot);
    let mut next_chapter_order = snapshot
        .chapters
        .iter()
        .map(|chapter| chapter.order_index)
        .max()
        .unwrap_or(-1)
        + 1;
    let timestamp = now_iso();
    let mut applied = Vec::new();
    let mut events = Vec::new();

    for proposal in &input.result.characters {
        let existing_character = proposal
            .target_character_id
            .as_ref()
            .and_then(|character_id| {
                snapshot
                    .characters
                    .iter()
                    .find(|character| character.id == *character_id)
            });
        let character_id = existing_character
            .map(|character| character.id.clone())
            .unwrap_or_else(|| format!("character-{}", Uuid::new_v4().simple()));
        let created_at = existing_character
            .map(|character| character.created_at.clone())
            .unwrap_or_else(|| timestamp.clone());
        let save_input = SaveCharacterInput {
            id: character_id.clone(),
            project_id: input.project_id.clone(),
            name: proposal.name.trim().to_string(),
            role: proposal.role.clone(),
            personality_traits: proposal.personality_traits.clone(),
            motivations: proposal.motivations.clone(),
            fears: proposal.fears.clone(),
            worldview: proposal.worldview.clone(),
            speaking_style: proposal.speaking_style.clone(),
            vocabulary_tendencies: proposal.vocabulary_tendencies.clone(),
            speech_rhythm: proposal.speech_rhythm.clone(),
            emotional_baseline: proposal.emotional_baseline.clone(),
            relationships: proposal
                .relationships
                .iter()
                .filter_map(|relationship| {
                    resolve_lookup_reference(&character_lookup, &relationship.character_id).map(
                        |related_character_id| Relationship {
                            character_id: related_character_id,
                            summary: relationship.summary.clone(),
                        },
                    )
                })
                .collect(),
            secrets: proposal.secrets.clone(),
            arc_direction: proposal.arc_direction.clone(),
            contradictions: proposal.contradictions.clone(),
        };

        transaction.execute(
            r#"
            INSERT INTO characters (
              id, project_id, name, role, personality_traits_json, motivations,
              fears, worldview, speaking_style, vocabulary_tendencies, speech_rhythm,
              emotional_baseline, secrets, arc_direction, contradictions, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              role = excluded.role,
              personality_traits_json = excluded.personality_traits_json,
              motivations = excluded.motivations,
              fears = excluded.fears,
              worldview = excluded.worldview,
              speaking_style = excluded.speaking_style,
              vocabulary_tendencies = excluded.vocabulary_tendencies,
              speech_rhythm = excluded.speech_rhythm,
              emotional_baseline = excluded.emotional_baseline,
              secrets = excluded.secrets,
              arc_direction = excluded.arc_direction,
              contradictions = excluded.contradictions,
              updated_at = excluded.updated_at
            "#,
            params![
                save_input.id,
                save_input.project_id,
                save_input.name,
                save_input.role,
                to_json(&save_input.personality_traits)?,
                save_input.motivations,
                save_input.fears,
                save_input.worldview,
                save_input.speaking_style,
                save_input.vocabulary_tendencies,
                save_input.speech_rhythm,
                save_input.emotional_baseline,
                save_input.secrets,
                save_input.arc_direction,
                save_input.contradictions,
                created_at,
                &timestamp,
            ],
        )?;
        upsert_character_relationships(&transaction, &save_input)?;

        remember_lookup_entry(&mut character_lookup, &character_id, &proposal.name);
        applied.push(DomainObjectRef {
            kind: "character".to_string(),
            id: character_id.clone(),
            title: Some(proposal.name.clone()),
        });
        events.push(json!({
            "id": format!("event-{}", Uuid::new_v4()),
            "projectId": &input.project_id,
            "occurredAt": &timestamp,
            "type": "character.updated",
            "characterId": character_id,
            "changedFields": [
                "name",
                "role",
                "personalityTraits",
                "motivations",
                "fears",
                "worldview",
                "speakingStyle",
                "vocabularyTendencies",
                "speechRhythm",
                "emotionalBaseline",
                "relationships",
                "secrets",
                "arcDirection",
                "contradictions"
            ]
        }));
    }

    for proposal in &input.result.chapters {
        let existing_chapter = proposal.target_chapter_id.as_ref().and_then(|chapter_id| {
            snapshot
                .chapters
                .iter()
                .find(|chapter| chapter.id == *chapter_id)
        });
        let chapter_id = existing_chapter
            .map(|chapter| chapter.id.clone())
            .unwrap_or_else(|| format!("chapter-{}", Uuid::new_v4().simple()));
        let created_at = existing_chapter
            .map(|chapter| chapter.created_at.clone())
            .unwrap_or_else(|| timestamp.clone());
        let order_index = existing_chapter
            .map(|chapter| chapter.order_index)
            .unwrap_or_else(|| {
                let order = next_chapter_order;
                next_chapter_order += 1;
                order
            });
        let save_input = SaveChapterInput {
            id: chapter_id.clone(),
            project_id: input.project_id.clone(),
            title: proposal.title.trim().to_string(),
            summary: proposal.summary.clone(),
            purpose: proposal.purpose.clone(),
            major_events: proposal.major_events.clone(),
            emotional_movement: proposal.emotional_movement.clone(),
            character_focus_ids: resolve_character_ids(
                &proposal.character_focus_ids,
                &character_lookup,
            ),
            setup_payoff_notes: proposal.setup_payoff_notes.clone(),
            order_index,
        };

        transaction.execute(
            r#"
            INSERT INTO chapters (
              id, project_id, title, summary, purpose, major_events_json,
              emotional_movement, character_focus_ids_json, setup_payoff_notes,
              order_index, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              summary = excluded.summary,
              purpose = excluded.purpose,
              major_events_json = excluded.major_events_json,
              emotional_movement = excluded.emotional_movement,
              character_focus_ids_json = excluded.character_focus_ids_json,
              setup_payoff_notes = excluded.setup_payoff_notes,
              order_index = excluded.order_index,
              updated_at = excluded.updated_at
            "#,
            params![
                save_input.id,
                save_input.project_id,
                save_input.title,
                save_input.summary,
                save_input.purpose,
                to_json(&save_input.major_events)?,
                save_input.emotional_movement,
                to_json(&save_input.character_focus_ids)?,
                save_input.setup_payoff_notes,
                save_input.order_index,
                created_at,
                &timestamp,
            ],
        )?;

        remember_lookup_entry(&mut chapter_lookup, &chapter_id, &proposal.title);
        applied.push(DomainObjectRef {
            kind: "chapter".to_string(),
            id: chapter_id.clone(),
            title: Some(proposal.title.clone()),
        });
        events.push(json!({
            "id": format!("event-{}", Uuid::new_v4()),
            "projectId": &input.project_id,
            "occurredAt": &timestamp,
            "type": "chapter.updated",
            "chapterId": chapter_id,
            "changedFields": [
                "title",
                "summary",
                "purpose",
                "majorEvents",
                "emotionalMovement",
                "characterFocusIds",
                "setupPayoffNotes"
            ]
        }));
    }

    for proposal in &input.result.scenes {
        let existing_scene = proposal
            .target_scene_id
            .as_ref()
            .and_then(|scene_id| snapshot.scenes.iter().find(|scene| scene.id == *scene_id));
        let scene_id = existing_scene
            .map(|scene| scene.id.clone())
            .unwrap_or_else(|| format!("scene-{}", Uuid::new_v4().simple()));
        let target_chapter_id = resolve_chapter_id(
            proposal,
            &chapter_lookup,
            existing_scene.and_then(|scene| scene.chapter_id.clone()),
        );
        let mut order_index = existing_scene
            .map(|scene| scene.order_index)
            .unwrap_or_else(|| {
                next_scene_order_index(&transaction, target_chapter_id.as_deref()).unwrap_or(0)
            });
        let chapter_changed = existing_scene
            .map(|scene| scene.chapter_id != target_chapter_id)
            .unwrap_or(false);
        let created_at = existing_scene
            .map(|scene| scene.created_at.clone())
            .unwrap_or_else(|| timestamp.clone());

        if existing_scene.is_none() {
            order_index = next_scene_order_index(&transaction, target_chapter_id.as_deref())?;
        }

        if chapter_changed {
            order_index = scene_count_in_bucket(&transaction, target_chapter_id.as_deref(), None)?;
        }

        let save_input = SaveSceneInput {
            id: scene_id.clone(),
            project_id: input.project_id.clone(),
            chapter_id: target_chapter_id.clone(),
            order_index,
            title: proposal.title.trim().to_string(),
            summary: proposal.summary.clone(),
            purpose: proposal.purpose.clone(),
            beat_outline: proposal.beat_outline.clone(),
            conflict: proposal.conflict.clone(),
            outcome: proposal.outcome.clone(),
            pov_character_id: resolve_optional_character_id(
                &proposal.pov_character_id,
                &character_lookup,
            ),
            location: proposal.location.clone(),
            time_label: proposal.time_label.clone(),
            involved_character_ids: resolve_character_ids(
                &proposal.involved_character_ids,
                &character_lookup,
            ),
            continuity_tags: proposal.continuity_tags.clone(),
            dependency_scene_ids: resolve_scene_ids(&proposal.dependency_scene_ids, &scene_lookup),
            manuscript_text: if proposal.manuscript_text.trim().is_empty() {
                "<p></p>".to_string()
            } else {
                proposal.manuscript_text.clone()
            },
        };

        transaction.execute(
            r#"
            INSERT INTO scenes (
              id, project_id, chapter_id, order_index, title, summary, purpose,
              beat_outline, conflict, outcome, pov_character_id, location,
              time_label, manuscript_text, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            ON CONFLICT(id) DO UPDATE SET
              chapter_id = excluded.chapter_id,
              order_index = excluded.order_index,
              title = excluded.title,
              summary = excluded.summary,
              purpose = excluded.purpose,
              beat_outline = excluded.beat_outline,
              conflict = excluded.conflict,
              outcome = excluded.outcome,
              pov_character_id = excluded.pov_character_id,
              location = excluded.location,
              time_label = excluded.time_label,
              manuscript_text = excluded.manuscript_text,
              updated_at = excluded.updated_at
            "#,
            params![
                save_input.id,
                save_input.project_id,
                optional_string(save_input.chapter_id.clone()),
                save_input.order_index,
                save_input.title,
                save_input.summary,
                save_input.purpose,
                save_input.beat_outline,
                save_input.conflict,
                save_input.outcome,
                optional_string(save_input.pov_character_id.clone()),
                save_input.location,
                save_input.time_label,
                save_input.manuscript_text,
                created_at,
                &timestamp,
            ],
        )?;
        upsert_scene_relations(&transaction, &save_input)?;

        if chapter_changed {
            move_scene_within_transaction(
                &transaction,
                &scene_id,
                target_chapter_id.clone(),
                i64::MAX,
            )?;
        }

        remember_lookup_entry(&mut scene_lookup, &scene_id, &proposal.title);
        applied.push(DomainObjectRef {
            kind: "scene".to_string(),
            id: scene_id.clone(),
            title: Some(proposal.title.clone()),
        });

        if let Some(existing_scene) = existing_scene {
            if existing_scene.chapter_id != target_chapter_id {
                events.push(json!({
                    "id": format!("event-{}", Uuid::new_v4()),
                    "projectId": &input.project_id,
                    "occurredAt": &timestamp,
                    "type": "scene.moved",
                    "sceneId": &scene_id,
                    "fromChapterId": existing_scene.chapter_id.clone(),
                    "toChapterId": target_chapter_id.clone(),
                }));
                continue;
            }
        }

        events.push(json!({
            "id": format!("event-{}", Uuid::new_v4()),
            "projectId": &input.project_id,
            "occurredAt": &timestamp,
            "type": "scene.updated",
            "sceneId": &scene_id,
            "changedFields": [
                "title",
                "summary",
                "purpose",
                "beatOutline",
                "conflict",
                "outcome",
                "povCharacterId",
                "location",
                "timeLabel",
                "involvedCharacterIds",
                "continuityTags",
                "dependencySceneIds",
                "manuscriptText"
            ]
        }));
    }

    transaction.commit()?;

    Ok(ApplyScratchpadResultOutput { applied, events })
}

pub fn save_chapter(path: &Path, input: SaveChapterInput) -> Result<Chapter> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;
    let existing_created_at: Option<String> = transaction
        .query_row(
            "SELECT created_at FROM chapters WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()?;

    let created_at = existing_created_at.unwrap_or_else(now_iso);
    let updated_at = now_iso();

    transaction.execute(
        r#"
        INSERT INTO chapters (
          id, project_id, title, summary, purpose, major_events_json,
          emotional_movement, character_focus_ids_json, setup_payoff_notes,
          order_index, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          purpose = excluded.purpose,
          major_events_json = excluded.major_events_json,
          emotional_movement = excluded.emotional_movement,
          character_focus_ids_json = excluded.character_focus_ids_json,
          setup_payoff_notes = excluded.setup_payoff_notes,
          order_index = excluded.order_index,
          updated_at = excluded.updated_at
        "#,
        params![
            input.id,
            input.project_id,
            input.title,
            input.summary,
            input.purpose,
            to_json(&input.major_events)?,
            input.emotional_movement,
            to_json(&input.character_focus_ids)?,
            input.setup_payoff_notes,
            input.order_index,
            created_at,
            updated_at,
        ],
    )?;
    transaction.commit()?;

    let connection = open_connection(path)?;
    let chapters = load_chapters(&connection)?;
    chapters
        .into_iter()
        .find(|chapter| chapter.id == input.id)
        .ok_or_else(|| anyhow!("Failed to load saved chapter."))
}

pub fn reorder_chapters(path: &Path, chapter_ids: &[String]) -> Result<()> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;

    for (index, chapter_id) in chapter_ids.iter().enumerate() {
        transaction.execute(
            "UPDATE chapters SET order_index = ?1, updated_at = ?2 WHERE id = ?3",
            params![index as i64, now_iso(), chapter_id],
        )?;
    }

    transaction.commit()?;
    Ok(())
}

pub fn save_scene(path: &Path, input: SaveSceneInput) -> Result<Scene> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;
    let existing_created_at: Option<String> = transaction
        .query_row(
            "SELECT created_at FROM scenes WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()?;

    let is_new_scene = existing_created_at.is_none();
    let created_at = existing_created_at.unwrap_or_else(now_iso);
    let updated_at = now_iso();
    let order_index = if is_new_scene {
        next_scene_order_index(&transaction, input.chapter_id.as_deref())?
    } else {
        input.order_index
    };

    transaction.execute(
        r#"
        INSERT INTO scenes (
          id, project_id, chapter_id, order_index, title, summary, purpose,
          beat_outline, conflict, outcome, pov_character_id, location,
          time_label, manuscript_text, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id) DO UPDATE SET
          chapter_id = excluded.chapter_id,
          order_index = excluded.order_index,
          title = excluded.title,
          summary = excluded.summary,
          purpose = excluded.purpose,
          beat_outline = excluded.beat_outline,
          conflict = excluded.conflict,
          outcome = excluded.outcome,
          pov_character_id = excluded.pov_character_id,
          location = excluded.location,
          time_label = excluded.time_label,
          manuscript_text = excluded.manuscript_text,
          updated_at = excluded.updated_at
        "#,
        params![
            input.id,
            input.project_id,
            optional_string(input.chapter_id.clone()),
            order_index,
            input.title,
            input.summary,
            input.purpose,
            input.beat_outline,
            input.conflict,
            input.outcome,
            optional_string(input.pov_character_id.clone()),
            input.location,
            input.time_label,
            input.manuscript_text,
            created_at,
            updated_at,
        ],
    )?;

    upsert_scene_relations(&transaction, &input)?;
    transaction.commit()?;

    let connection = open_connection(path)?;
    let scenes = load_scenes(&connection)?;
    scenes
        .into_iter()
        .find(|scene| scene.id == input.id)
        .ok_or_else(|| anyhow!("Failed to load saved scene."))
}

pub fn move_scene(path: &Path, input: MoveSceneInput) -> Result<Scene> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;
    move_scene_within_transaction(
        &transaction,
        &input.scene_id,
        input.target_chapter_id.clone(),
        input.target_index,
    )?;

    transaction.commit()?;

    let connection = open_connection(path)?;
    let scenes = load_scenes(&connection)?;
    scenes
        .into_iter()
        .find(|scene| scene.id == input.scene_id)
        .ok_or_else(|| anyhow!("Failed to load moved scene."))
}

pub fn save_manuscript(path: &Path, input: SaveManuscriptInput) -> Result<Scene> {
    let connection = open_connection(path)?;
    connection.execute(
        "UPDATE scenes SET manuscript_text = ?1, updated_at = ?2 WHERE id = ?3 AND project_id = ?4",
        params![
            input.manuscript_text,
            now_iso(),
            input.scene_id,
            input.project_id
        ],
    )?;

    let scenes = load_scenes(&connection)?;
    scenes
        .into_iter()
        .find(|scene| scene.id == input.scene_id)
        .ok_or_else(|| anyhow!("Failed to load saved manuscript."))
}

pub fn save_character(path: &Path, input: SaveCharacterInput) -> Result<Character> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;
    let existing_created_at: Option<String> = transaction
        .query_row(
            "SELECT created_at FROM characters WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()?;

    let created_at = existing_created_at.unwrap_or_else(now_iso);
    let updated_at = now_iso();

    transaction.execute(
        r#"
        INSERT INTO characters (
          id, project_id, name, role, personality_traits_json, motivations,
          fears, worldview, speaking_style, vocabulary_tendencies, speech_rhythm,
          emotional_baseline, secrets, arc_direction, contradictions, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          personality_traits_json = excluded.personality_traits_json,
          motivations = excluded.motivations,
          fears = excluded.fears,
          worldview = excluded.worldview,
          speaking_style = excluded.speaking_style,
          vocabulary_tendencies = excluded.vocabulary_tendencies,
          speech_rhythm = excluded.speech_rhythm,
          emotional_baseline = excluded.emotional_baseline,
          secrets = excluded.secrets,
          arc_direction = excluded.arc_direction,
          contradictions = excluded.contradictions,
          updated_at = excluded.updated_at
        "#,
        params![
            input.id,
            input.project_id,
            input.name,
            input.role,
            to_json(&input.personality_traits)?,
            input.motivations,
            input.fears,
            input.worldview,
            input.speaking_style,
            input.vocabulary_tendencies,
            input.speech_rhythm,
            input.emotional_baseline,
            input.secrets,
            input.arc_direction,
            input.contradictions,
            created_at,
            updated_at,
        ],
    )?;

    upsert_character_relationships(&transaction, &input)?;
    transaction.commit()?;

    let connection = open_connection(path)?;
    let characters = load_characters(&connection)?;
    characters
        .into_iter()
        .find(|character| character.id == input.id)
        .ok_or_else(|| anyhow!("Failed to load saved character."))
}

pub fn list_suggestions(path: &Path) -> Result<Vec<Suggestion>> {
    let connection = open_connection(path)?;
    load_suggestions(&connection)
}

pub fn save_project_state(path: &Path, state: ProjectState) -> Result<ProjectState> {
    let connection = open_connection(path)?;
    connection.execute(
        r#"
        UPDATE project_state SET
          last_route = ?2,
          open_scene_ids_json = ?3,
          selected_ids_json = ?4,
          view_filters_json = ?5,
          panel_layout_json = ?6,
          autosave_state_json = ?7,
          analysis_queue_json = ?8,
          last_full_scan_at = ?9
        WHERE project_id = ?1
        "#,
        params![
            state.project_id,
            state.last_route,
            to_json(&state.open_scene_ids)?,
            to_json(&state.selected_ids)?,
            to_json(&state.view_filters)?,
            to_json(&state.panel_layout)?,
            to_json(&state.autosave_state)?,
            to_json(&state.analysis_queue)?,
            state.last_full_scan_at,
        ],
    )?;

    Ok(state)
}

fn set_suggestion_status(
    path: &Path,
    project_id: &str,
    suggestion_id: &str,
    status: &str,
) -> Result<()> {
    let connection = open_connection(path)?;
    connection.execute(
        "UPDATE suggestions SET status = ?1, updated_at = ?2 WHERE id = ?3 AND project_id = ?4",
        params![status, now_iso(), suggestion_id, project_id],
    )?;
    Ok(())
}

pub fn apply_suggestion(path: &Path, input: ApplySuggestionInput) -> Result<()> {
    set_suggestion_status(path, &input.project_id, &input.suggestion_id, "applied")
}

pub fn dismiss_suggestion(path: &Path, input: DismissSuggestionInput) -> Result<()> {
    set_suggestion_status(path, &input.project_id, &input.suggestion_id, "dismissed")
}

pub fn sync_suggestions(path: &Path, input: SyncSuggestionsInput) -> Result<Vec<Suggestion>> {
    let mut connection = open_connection(path)?;
    let transaction = connection.transaction()?;

    transaction.execute(
        "UPDATE suggestions SET status = 'resolved', updated_at = ?1 WHERE project_id = ?2 AND trigger_event = ?3",
        params![now_iso(), input.project_id, input.trigger_event],
    )?;

    for suggestion in &input.suggestions {
        transaction.execute(
            r#"
            INSERT INTO suggestions (
              id, project_id, type, trigger_event, source_kind, source_id, source_title,
              impacted_kind, impacted_id, impacted_title, severity, title, rationale,
              evidence_refs_json, proposed_action, status, fingerprint, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
            ON CONFLICT(project_id, fingerprint) DO UPDATE SET
              type = excluded.type,
              trigger_event = excluded.trigger_event,
              source_kind = excluded.source_kind,
              source_id = excluded.source_id,
              source_title = excluded.source_title,
              impacted_kind = excluded.impacted_kind,
              impacted_id = excluded.impacted_id,
              impacted_title = excluded.impacted_title,
              severity = excluded.severity,
              title = excluded.title,
              rationale = excluded.rationale,
              evidence_refs_json = excluded.evidence_refs_json,
              proposed_action = excluded.proposed_action,
              status = 'open',
              updated_at = excluded.updated_at
            "#,
            params![
                suggestion.id,
                suggestion.project_id,
                suggestion.r#type,
                suggestion.trigger_event,
                suggestion.source_object.kind,
                suggestion.source_object.id,
                suggestion.source_object.title,
                suggestion.impacted_object.kind,
                suggestion.impacted_object.id,
                suggestion.impacted_object.title,
                suggestion.severity,
                suggestion.title,
                suggestion.rationale,
                to_json(&suggestion.evidence_refs)?,
                suggestion.proposed_action,
                suggestion.status,
                suggestion.fingerprint,
                suggestion.created_at,
                suggestion.updated_at,
            ],
        )?;
    }

    if input.trigger_event == "analysis.manualRequested" {
        transaction.execute(
            "UPDATE project_state SET last_full_scan_at = ?1 WHERE project_id = ?2",
            params![now_iso(), input.project_id],
        )?;
    }

    transaction.commit()?;

    let connection = open_connection(path)?;
    load_suggestions(&connection)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn table_exists(connection: &Connection, table_name: &str) -> Result<bool> {
        let exists: i64 = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            params![table_name],
            |row| row.get(0),
        )?;
        Ok(exists == 1)
    }

    fn cleanup_db_files(path: &Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(format!("{}-wal", path.display()));
        let _ = fs::remove_file(format!("{}-shm", path.display()));
    }

    #[test]
    fn initial_migration_creates_required_tables() -> Result<()> {
        let mut connection = Connection::open_in_memory()?;
        migrate(&mut connection)?;

        assert_eq!(
            current_schema_version(&connection)?,
            latest_schema_version()
        );

        for table_name in [
            "project",
            "chapters",
            "scenes",
            "scene_characters",
            "scene_dependencies",
            "scene_continuity_tags",
            "characters",
            "character_relationships",
            "suggestions",
            "project_state",
        ] {
            assert!(table_exists(&connection, table_name)?);
        }

        Ok(())
    }

    #[test]
    fn create_project_bootstraps_default_project_state() -> Result<()> {
        let temp_path =
            std::env::temp_dir().join(format!("novelforge-step12-{}.novelforge", Uuid::new_v4()));
        cleanup_db_files(&temp_path);

        let (_, snapshot) = create_project(CreateProjectInput {
            title: "Smoke Test Novel".to_string(),
            logline: "A migration smoke test project.".to_string(),
            path: temp_path.to_string_lossy().into_owned(),
        })?;

        assert_eq!(snapshot.project.schema_version, latest_schema_version());
        assert_eq!(snapshot.project_state.project_id, snapshot.project.id);
        assert_eq!(snapshot.project_state.last_route, "/chapters");
        assert_eq!(snapshot.project.premise, "");
        assert_eq!(snapshot.project.central_conflict, "");
        assert_eq!(snapshot.project.thematic_intent, "");
        assert_eq!(snapshot.project.ending_direction, "");
        assert_eq!(snapshot.project.genre, "");
        assert_eq!(snapshot.project.tone, "");
        assert_eq!(snapshot.project.audience_notes, "");
        assert!(snapshot.chapters.is_empty());
        assert!(snapshot.scenes.is_empty());
        assert!(snapshot.characters.is_empty());
        assert!(snapshot.suggestions.is_empty());

        cleanup_db_files(&temp_path);
        Ok(())
    }

    #[test]
    fn save_project_metadata_round_trips_story_brief_fields() -> Result<()> {
        let temp_path = std::env::temp_dir().join(format!(
            "novelforge-project-brief-{}.novelforge",
            Uuid::new_v4()
        ));
        cleanup_db_files(&temp_path);

        let (_, snapshot) = create_project(CreateProjectInput {
            title: "Ashen Sky".to_string(),
            logline: "A smuggler escorts a living map.".to_string(),
            path: temp_path.to_string_lossy().into_owned(),
        })?;

        let saved_project = save_project_metadata(
            &temp_path,
            SaveProjectMetadataInput {
                id: snapshot.project.id.clone(),
                title: "Ashen Sky".to_string(),
                logline: "A failed smuggler escorts a living star-map across a collapsing empire."
                    .to_string(),
                premise: "A disgraced courier becomes the only safe carrier for a living map."
                    .to_string(),
                central_conflict:
                    "Every faction wants the map, and Ava does not trust herself to protect it."
                        .to_string(),
                thematic_intent: "Explore when responsibility turns into chosen freedom."
                    .to_string(),
                ending_direction: "Costly hope over escape.".to_string(),
                genre: "Science-fantasy adventure".to_string(),
                tone: "Tense and wonder-struck.".to_string(),
                audience_notes: "For readers who want propulsive plotting with emotional weight."
                    .to_string(),
            },
        )?;

        assert_eq!(
            saved_project.premise,
            "A disgraced courier becomes the only safe carrier for a living map."
        );
        assert_eq!(
            saved_project.central_conflict,
            "Every faction wants the map, and Ava does not trust herself to protect it."
        );
        assert_eq!(
            saved_project.thematic_intent,
            "Explore when responsibility turns into chosen freedom."
        );
        assert_eq!(saved_project.ending_direction, "Costly hope over escape.");
        assert_eq!(saved_project.genre, "Science-fantasy adventure");
        assert_eq!(saved_project.tone, "Tense and wonder-struck.");
        assert_eq!(
            saved_project.audience_notes,
            "For readers who want propulsive plotting with emotional weight."
        );

        let refreshed = get_snapshot(&temp_path)?;
        assert_eq!(refreshed.project.premise, saved_project.premise);
        assert_eq!(
            refreshed.project.central_conflict,
            saved_project.central_conflict
        );
        assert_eq!(
            refreshed.project.thematic_intent,
            saved_project.thematic_intent
        );
        assert_eq!(
            refreshed.project.ending_direction,
            saved_project.ending_direction
        );
        assert_eq!(refreshed.project.genre, saved_project.genre);
        assert_eq!(refreshed.project.tone, saved_project.tone);
        assert_eq!(
            refreshed.project.audience_notes,
            saved_project.audience_notes
        );

        cleanup_db_files(&temp_path);
        Ok(())
    }

    #[test]
    fn apply_scratchpad_result_creates_structured_story_objects() -> Result<()> {
        let temp_path = std::env::temp_dir().join(format!(
            "novelforge-scratchpad-{}.novelforge",
            Uuid::new_v4()
        ));
        cleanup_db_files(&temp_path);

        let (_, snapshot) = create_project(CreateProjectInput {
            title: "Scratchpad Smoke Test".to_string(),
            logline: "A structured scratchpad apply smoke test.".to_string(),
            path: temp_path.to_string_lossy().into_owned(),
        })?;

        let output = apply_scratchpad_result(
            &temp_path,
            ApplyScratchpadResultInput {
                project_id: snapshot.project.id.clone(),
                result: crate::models::ScratchpadResult {
                    summary: "Built a chapter, scene, and character.".to_string(),
                    chapters: vec![crate::models::ChapterProposal {
                        target_chapter_id: None,
                        title: "Chapter 1".to_string(),
                        summary: "Opening chapter".to_string(),
                        purpose: "Start the story".to_string(),
                        major_events: vec!["The call arrives".to_string()],
                        emotional_movement: "Calm to dread".to_string(),
                        character_focus_ids: vec![],
                        setup_payoff_notes: "The signal matters later.".to_string(),
                    }],
                    scenes: vec![crate::models::SceneProposal {
                        target_scene_id: None,
                        chapter_id: None,
                        chapter_title_hint: Some("Chapter 1".to_string()),
                        title: "The Signal".to_string(),
                        summary: "A signal interrupts the quiet morning.".to_string(),
                        purpose: "Inciting incident".to_string(),
                        beat_outline:
                            "Signal appears\nThe protagonist hesitates\nThe decision gets made"
                                .to_string(),
                        conflict: "Ignore it or investigate.".to_string(),
                        outcome: "The protagonist chooses to investigate.".to_string(),
                        pov_character_id: None,
                        location: "Harbor".to_string(),
                        time_label: "Morning".to_string(),
                        involved_character_ids: vec![],
                        continuity_tags: vec!["signal".to_string()],
                        dependency_scene_ids: vec![],
                        manuscript_text: "<p>The buoy rang once.</p>".to_string(),
                    }],
                    characters: vec![crate::models::CharacterProposal {
                        target_character_id: None,
                        name: "Mara".to_string(),
                        role: "Protagonist".to_string(),
                        personality_traits: vec!["stubborn".to_string()],
                        motivations: "Find the truth.".to_string(),
                        fears: "Losing another crew.".to_string(),
                        worldview: "Buried things stay dangerous.".to_string(),
                        speaking_style: "Dry and blunt.".to_string(),
                        vocabulary_tendencies: "Seafaring slang.".to_string(),
                        speech_rhythm: "Clipped when stressed.".to_string(),
                        emotional_baseline: "Guarded.".to_string(),
                        relationships: vec![],
                        secrets: "She already knows the ship name.".to_string(),
                        arc_direction: "From loner to leader.".to_string(),
                        contradictions: "Acts detached but keeps saving people.".to_string(),
                    }],
                    continuity_notes: vec!["Track the signal reveal order.".to_string()],
                },
            },
        )?;

        assert_eq!(output.applied.len(), 3);
        assert_eq!(output.events.len(), 3);

        let refreshed = get_snapshot(&temp_path)?;
        assert_eq!(refreshed.chapters.len(), 1);
        assert_eq!(refreshed.scenes.len(), 1);
        assert_eq!(refreshed.characters.len(), 1);
        assert_eq!(
            refreshed.scenes[0].chapter_id,
            Some(refreshed.chapters[0].id.clone())
        );
        assert_eq!(
            refreshed.scenes[0].beat_outline,
            "Signal appears\nThe protagonist hesitates\nThe decision gets made"
        );

        cleanup_db_files(&temp_path);
        Ok(())
    }

    #[test]
    fn save_scene_appends_new_scene_to_the_end_of_its_chapter() -> Result<()> {
        let temp_path = std::env::temp_dir().join(format!(
            "novelforge-scene-order-{}.novelforge",
            Uuid::new_v4()
        ));
        cleanup_db_files(&temp_path);

        let (_, snapshot) = create_project(CreateProjectInput {
            title: "Scene Order Test".to_string(),
            logline: "Verify new scenes append in chapter order.".to_string(),
            path: temp_path.to_string_lossy().into_owned(),
        })?;

        let chapter = save_chapter(
            &temp_path,
            SaveChapterInput {
                id: "chapter-1".to_string(),
                project_id: snapshot.project.id.clone(),
                title: "Chapter 1".to_string(),
                summary: String::new(),
                purpose: String::new(),
                major_events: vec![],
                emotional_movement: String::new(),
                character_focus_ids: vec![],
                setup_payoff_notes: String::new(),
                order_index: 0,
            },
        )?;

        save_scene(
            &temp_path,
            SaveSceneInput {
                id: "scene-1".to_string(),
                project_id: snapshot.project.id.clone(),
                chapter_id: Some(chapter.id.clone()),
                order_index: 0,
                title: "Scene 1".to_string(),
                summary: String::new(),
                purpose: String::new(),
                beat_outline: String::new(),
                conflict: String::new(),
                outcome: String::new(),
                pov_character_id: None,
                location: String::new(),
                time_label: String::new(),
                involved_character_ids: vec![],
                continuity_tags: vec![],
                dependency_scene_ids: vec![],
                manuscript_text: "<p></p>".to_string(),
            },
        )?;

        save_scene(
            &temp_path,
            SaveSceneInput {
                id: "scene-2".to_string(),
                project_id: snapshot.project.id.clone(),
                chapter_id: Some(chapter.id.clone()),
                order_index: 0,
                title: "Scene 2".to_string(),
                summary: String::new(),
                purpose: String::new(),
                beat_outline: String::new(),
                conflict: String::new(),
                outcome: String::new(),
                pov_character_id: None,
                location: String::new(),
                time_label: String::new(),
                involved_character_ids: vec![],
                continuity_tags: vec![],
                dependency_scene_ids: vec![],
                manuscript_text: "<p></p>".to_string(),
            },
        )?;

        let appended_scene = save_scene(
            &temp_path,
            SaveSceneInput {
                id: "scene-3".to_string(),
                project_id: snapshot.project.id.clone(),
                chapter_id: Some(chapter.id),
                order_index: 0,
                title: "Scene 3".to_string(),
                summary: String::new(),
                purpose: String::new(),
                beat_outline: String::new(),
                conflict: String::new(),
                outcome: String::new(),
                pov_character_id: None,
                location: String::new(),
                time_label: String::new(),
                involved_character_ids: vec![],
                continuity_tags: vec![],
                dependency_scene_ids: vec![],
                manuscript_text: "<p></p>".to_string(),
            },
        )?;

        assert_eq!(appended_scene.order_index, 2);

        cleanup_db_files(&temp_path);
        Ok(())
    }
}
