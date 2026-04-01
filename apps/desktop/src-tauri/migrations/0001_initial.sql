CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  logline TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  purpose TEXT NOT NULL,
  major_events_json TEXT NOT NULL,
  emotional_movement TEXT NOT NULL,
  character_focus_ids_json TEXT NOT NULL,
  setup_payoff_notes TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  purpose TEXT NOT NULL,
  conflict TEXT NOT NULL,
  outcome TEXT NOT NULL,
  pov_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  location TEXT NOT NULL,
  time_label TEXT NOT NULL,
  manuscript_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scene_characters (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (scene_id, character_id)
);

CREATE TABLE IF NOT EXISTS scene_dependencies (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  dependency_scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (scene_id, dependency_scene_id)
);

CREATE TABLE IF NOT EXISTS scene_continuity_tags (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (scene_id, tag)
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  personality_traits_json TEXT NOT NULL,
  motivations TEXT NOT NULL,
  fears TEXT NOT NULL,
  worldview TEXT NOT NULL,
  speaking_style TEXT NOT NULL,
  vocabulary_tendencies TEXT NOT NULL,
  speech_rhythm TEXT NOT NULL,
  emotional_baseline TEXT NOT NULL,
  secrets TEXT NOT NULL,
  arc_direction TEXT NOT NULL,
  contradictions TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_relationships (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  related_character_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (character_id, related_character_id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_title TEXT,
  impacted_kind TEXT NOT NULL,
  impacted_id TEXT NOT NULL,
  impacted_title TEXT,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  status TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS project_state (
  project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  last_route TEXT NOT NULL,
  open_scene_ids_json TEXT NOT NULL,
  selected_ids_json TEXT NOT NULL,
  view_filters_json TEXT NOT NULL,
  panel_layout_json TEXT NOT NULL,
  autosave_state_json TEXT NOT NULL,
  analysis_queue_json TEXT NOT NULL,
  last_full_scan_at TEXT
);
