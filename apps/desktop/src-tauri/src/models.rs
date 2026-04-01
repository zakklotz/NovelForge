use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub autosave_interval_ms: i64,
    pub auto_analyze: bool,
    pub editor_font_scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIProviderSettings {
    pub enabled: bool,
    pub has_api_key: bool,
    pub default_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    pub default_provider: String,
    pub providers: AIProviders,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIProviders {
    pub gemini: AIProviderSettings,
    pub groq: AIProviderSettings,
    pub openrouter: AIProviderSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub ai: AISettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedModel {
    pub provider_id: String,
    pub model_id: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub title: String,
    pub logline: String,
    pub schema_version: i64,
    pub settings: ProjectSettings,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub summary: String,
    pub purpose: String,
    pub major_events: Vec<String>,
    pub emotional_movement: String,
    pub character_focus_ids: Vec<String>,
    pub setup_payoff_notes: String,
    pub order_index: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub project_id: String,
    pub chapter_id: Option<String>,
    pub order_index: i64,
    pub title: String,
    pub summary: String,
    pub purpose: String,
    pub beat_outline: String,
    pub conflict: String,
    pub outcome: String,
    pub pov_character_id: Option<String>,
    pub location: String,
    pub time_label: String,
    pub involved_character_ids: Vec<String>,
    pub continuity_tags: Vec<String>,
    pub dependency_scene_ids: Vec<String>,
    pub manuscript_text: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub character_id: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub role: String,
    pub personality_traits: Vec<String>,
    pub motivations: String,
    pub fears: String,
    pub worldview: String,
    pub speaking_style: String,
    pub vocabulary_tendencies: String,
    pub speech_rhythm: String,
    pub emotional_baseline: String,
    pub relationships: Vec<Relationship>,
    pub secrets: String,
    pub arc_direction: String,
    pub contradictions: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainObjectRef {
    pub kind: String,
    pub id: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionEvidenceRef {
    pub kind: String,
    pub id: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub id: String,
    pub project_id: String,
    pub r#type: String,
    pub trigger_event: String,
    pub source_object: DomainObjectRef,
    pub impacted_object: DomainObjectRef,
    pub severity: String,
    pub title: String,
    pub rationale: String,
    pub evidence_refs: Vec<SuggestionEvidenceRef>,
    pub proposed_action: String,
    pub status: String,
    pub fingerprint: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewFilters {
    pub active_chapter_id: Option<String>,
    pub search_text: String,
    pub scene_character_id: Option<String>,
    pub scene_continuity_tag: Option<String>,
    pub suggestion_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelLayout {
    pub chapters_inspector_width: i64,
    pub scene_left_width: i64,
    pub scene_right_width: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutosaveState {
    pub is_saving: bool,
    pub last_saved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisQueueItem {
    pub event_type: String,
    pub entity_id: Option<String>,
    pub queued_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    pub project_id: String,
    pub last_route: String,
    pub open_scene_ids: Vec<String>,
    pub selected_ids: Vec<String>,
    pub view_filters: ViewFilters,
    pub panel_layout: PanelLayout,
    pub autosave_state: AutosaveState,
    pub analysis_queue: Vec<AnalysisQueueItem>,
    pub last_full_scan_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub project: Project,
    pub chapters: Vec<Chapter>,
    pub scenes: Vec<Scene>,
    pub characters: Vec<Character>,
    pub suggestions: Vec<Suggestion>,
    pub project_state: ProjectState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadProjectContext {
    pub chapter_ids: Vec<String>,
    pub scene_ids: Vec<String>,
    pub character_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterProposal {
    pub target_chapter_id: Option<String>,
    pub title: String,
    pub summary: String,
    pub purpose: String,
    pub major_events: Vec<String>,
    pub emotional_movement: String,
    pub character_focus_ids: Vec<String>,
    pub setup_payoff_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneProposal {
    pub target_scene_id: Option<String>,
    pub chapter_id: Option<String>,
    pub chapter_title_hint: Option<String>,
    pub title: String,
    pub summary: String,
    pub purpose: String,
    pub beat_outline: String,
    pub conflict: String,
    pub outcome: String,
    pub pov_character_id: Option<String>,
    pub location: String,
    pub time_label: String,
    pub involved_character_ids: Vec<String>,
    pub continuity_tags: Vec<String>,
    pub dependency_scene_ids: Vec<String>,
    pub manuscript_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterProposal {
    pub target_character_id: Option<String>,
    pub name: String,
    pub role: String,
    pub personality_traits: Vec<String>,
    pub motivations: String,
    pub fears: String,
    pub worldview: String,
    pub speaking_style: String,
    pub vocabulary_tendencies: String,
    pub speech_rhythm: String,
    pub emotional_baseline: String,
    pub relationships: Vec<Relationship>,
    pub secrets: String,
    pub arc_direction: String,
    pub contradictions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadResult {
    pub summary: String,
    pub chapters: Vec<ChapterProposal>,
    pub scenes: Vec<SceneProposal>,
    pub characters: Vec<CharacterProposal>,
    pub continuity_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ScratchpadSession {
    pub id: String,
    pub title: String,
    pub messages: Vec<ScratchpadMessage>,
    pub latest_result: Option<ScratchpadResult>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConnectionResult {
    pub provider_id: String,
    pub model_id: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadChatResponse {
    pub provider_id: String,
    pub model_id: String,
    pub assistant_message: ScratchpadMessage,
    pub result: ScratchpadResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoryDiagnosticEntry {
    pub title: String,
    pub detail: String,
    pub focus: Option<DomainObjectRef>,
    pub related: Vec<DomainObjectRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoryStructureDiagnostic {
    pub underdefined_chapters: Vec<StoryDiagnosticEntry>,
    pub redundant_functions: Vec<StoryDiagnosticEntry>,
    pub missing_transitions: Vec<StoryDiagnosticEntry>,
    pub next_planning_targets: Vec<StoryDiagnosticEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAIResult {
    pub summary: String,
    pub scene_proposals: Vec<SceneProposal>,
    pub beat_outline: String,
    pub manuscript_text: String,
    pub story_structure_diagnostic: StoryStructureDiagnostic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAIResponse {
    pub provider_id: String,
    pub model_id: String,
    pub action: String,
    pub assistant_message: String,
    pub result: StructuredAIResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyScratchpadResultOutput {
    pub applied: Vec<DomainObjectRef>,
    pub events: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub title: String,
    pub logline: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectInput {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChapterInput {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub summary: String,
    pub purpose: String,
    pub major_events: Vec<String>,
    pub emotional_movement: String,
    pub character_focus_ids: Vec<String>,
    pub setup_payoff_notes: String,
    pub order_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSceneInput {
    pub id: String,
    pub project_id: String,
    pub chapter_id: Option<String>,
    pub order_index: i64,
    pub title: String,
    pub summary: String,
    pub purpose: String,
    pub beat_outline: String,
    pub conflict: String,
    pub outcome: String,
    pub pov_character_id: Option<String>,
    pub location: String,
    pub time_label: String,
    pub involved_character_ids: Vec<String>,
    pub continuity_tags: Vec<String>,
    pub dependency_scene_ids: Vec<String>,
    pub manuscript_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveSceneInput {
    pub project_id: String,
    pub scene_id: String,
    pub target_chapter_id: Option<String>,
    pub target_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManuscriptInput {
    pub project_id: String,
    pub scene_id: String,
    pub manuscript_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCharacterInput {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub role: String,
    pub personality_traits: Vec<String>,
    pub motivations: String,
    pub fears: String,
    pub worldview: String,
    pub speaking_style: String,
    pub vocabulary_tendencies: String,
    pub speech_rhythm: String,
    pub emotional_baseline: String,
    pub relationships: Vec<Relationship>,
    pub secrets: String,
    pub arc_direction: String,
    pub contradictions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAIProviderSettingsInput {
    pub enabled: bool,
    pub default_model: String,
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAIProvidersInput {
    pub gemini: SaveAIProviderSettingsInput,
    pub groq: SaveAIProviderSettingsInput,
    pub openrouter: SaveAIProviderSettingsInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAISettingsInput {
    pub default_provider: String,
    pub providers: SaveAIProvidersInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAppSettingsInput {
    pub ai: SaveAISettingsInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestProviderConnectionInput {
    pub provider_id: String,
    pub model_id: String,
    pub api_key_override: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunScratchpadChatInput {
    pub project_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub action: String,
    pub session_id: String,
    pub session_title: String,
    pub messages: Vec<ScratchpadMessage>,
    pub user_input: String,
    pub project_context: ScratchpadProjectContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStructuredAIActionInput {
    pub project_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub action: String,
    pub chapter_id: Option<String>,
    pub scene_id: Option<String>,
    pub workspace_context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyScratchpadResultInput {
    pub project_id: String,
    pub result: ScratchpadResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct RunImpactAnalysisInput {
    pub project_id: String,
    pub event_type: String,
    pub entity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySuggestionInput {
    pub project_id: String,
    pub suggestion_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DismissSuggestionInput {
    pub project_id: String,
    pub suggestion_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSuggestionsInput {
    pub project_id: String,
    pub trigger_event: String,
    pub suggestions: Vec<Suggestion>,
}
