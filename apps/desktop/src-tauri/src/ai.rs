use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::app_settings::get_provider_api_key;
use crate::models::{
    Chapter, ChapterProposal, Character, CharacterProposal, ProjectSnapshot,
    ProviderConnectionResult, RecommendedModel, Relationship, RunScratchpadChatInput,
    RunStructuredAIActionInput, Scene, SceneProposal, ScratchpadChatResponse, ScratchpadMessage,
    ScratchpadProjectContext, ScratchpadResult, StoryBriefAlignment, StoryBriefAlignmentNote,
    StoryDiagnosticEntry, StoryStructureDiagnostic, StructuredAIResponse, StructuredAIResult,
    TestProviderConnectionInput,
};

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(Debug, Clone, Serialize)]
struct OpenAIStyleMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAIStyleRequest {
    model: String,
    messages: Vec<OpenAIStyleMessage>,
    temperature: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    temperature: f32,
    response_mime_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    system_instruction: GeminiInstruction,
    contents: Vec<GeminiContent>,
    generation_config: GeminiGenerationConfig,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScratchpadChapter {
    #[serde(default)]
    target_chapter_id: Option<String>,
    #[serde(default)]
    title: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    purpose: String,
    #[serde(default)]
    major_events: Vec<String>,
    #[serde(default)]
    emotional_movement: String,
    #[serde(default)]
    character_focus_ids: Vec<String>,
    #[serde(default)]
    setup_payoff_notes: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScratchpadScene {
    #[serde(default)]
    target_scene_id: Option<String>,
    #[serde(default)]
    chapter_id: Option<String>,
    #[serde(default)]
    chapter_title_hint: Option<String>,
    #[serde(default)]
    title: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    purpose: String,
    #[serde(default)]
    beat_outline: String,
    #[serde(default)]
    conflict: String,
    #[serde(default)]
    outcome: String,
    #[serde(default)]
    pov_character_id: Option<String>,
    #[serde(default)]
    location: String,
    #[serde(default)]
    time_label: String,
    #[serde(default)]
    involved_character_ids: Vec<String>,
    #[serde(default)]
    continuity_tags: Vec<String>,
    #[serde(default)]
    dependency_scene_ids: Vec<String>,
    #[serde(default)]
    manuscript_text: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScratchpadCharacter {
    #[serde(default)]
    target_character_id: Option<String>,
    #[serde(default)]
    name: String,
    #[serde(default)]
    role: String,
    #[serde(default)]
    personality_traits: Vec<String>,
    #[serde(default)]
    motivations: String,
    #[serde(default)]
    fears: String,
    #[serde(default)]
    worldview: String,
    #[serde(default)]
    speaking_style: String,
    #[serde(default)]
    vocabulary_tendencies: String,
    #[serde(default)]
    speech_rhythm: String,
    #[serde(default)]
    emotional_baseline: String,
    #[serde(default)]
    relationships: Vec<Relationship>,
    #[serde(default)]
    secrets: String,
    #[serde(default)]
    arc_direction: String,
    #[serde(default)]
    contradictions: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScratchpadResult {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    chapters: Vec<RawScratchpadChapter>,
    #[serde(default)]
    scenes: Vec<RawScratchpadScene>,
    #[serde(default)]
    characters: Vec<RawScratchpadCharacter>,
    #[serde(default)]
    continuity_notes: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScratchpadEnvelope {
    #[serde(default)]
    assistant_message: String,
    #[serde(default)]
    result: RawScratchpadResult,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDomainObjectRef {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStoryDiagnosticEntry {
    #[serde(default)]
    title: String,
    #[serde(default)]
    detail: String,
    #[serde(default)]
    alignment: String,
    #[serde(default)]
    focus: Option<RawDomainObjectRef>,
    #[serde(default)]
    related: Vec<RawDomainObjectRef>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStoryStructureDiagnostic {
    #[serde(default)]
    underdefined_chapters: Vec<RawStoryDiagnosticEntry>,
    #[serde(default)]
    redundant_functions: Vec<RawStoryDiagnosticEntry>,
    #[serde(default)]
    missing_transitions: Vec<RawStoryDiagnosticEntry>,
    #[serde(default)]
    brief_alignment_notes: Vec<RawStoryDiagnosticEntry>,
    #[serde(default)]
    ending_direction_preparation: Vec<RawStoryDiagnosticEntry>,
    #[serde(default)]
    setup_payoff_support: Vec<RawStoryDiagnosticEntry>,
    #[serde(default)]
    next_planning_targets: Vec<RawStoryDiagnosticEntry>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStructuredActionResult {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    scene_proposals: Vec<RawScratchpadScene>,
    #[serde(default)]
    beat_outline: String,
    #[serde(default)]
    manuscript_text: String,
    #[serde(default)]
    story_structure_diagnostic: RawStoryStructureDiagnostic,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStructuredActionEnvelope {
    #[serde(default)]
    assistant_message: String,
    #[serde(default)]
    result: RawStructuredActionResult,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn recommended_models() -> Vec<RecommendedModel> {
    vec![
        RecommendedModel {
            provider_id: "gemini".to_string(),
            model_id: "gemini-2.5-flash".to_string(),
            label: "Gemini 2.5 Flash".to_string(),
            description: "Best default for long-context story planning and rapid drafting help."
                .to_string(),
        },
        RecommendedModel {
            provider_id: "groq".to_string(),
            model_id: "llama-3.3-70b-versatile".to_string(),
            label: "Llama 3.3 70B Versatile".to_string(),
            description: "Fast general-purpose chat for iterative brainstorming and rewrites."
                .to_string(),
        },
        RecommendedModel {
            provider_id: "openrouter".to_string(),
            model_id: "openrouter/free".to_string(),
            label: "OpenRouter Free Router".to_string(),
            description: "Routes to currently free OpenRouter models for flexible experimentation."
                .to_string(),
        },
    ]
}

pub fn list_recommended_models(provider_id: Option<String>) -> Vec<RecommendedModel> {
    match provider_id {
        Some(provider_id) => recommended_models()
            .into_iter()
            .filter(|model| model.provider_id == provider_id)
            .collect(),
        None => recommended_models(),
    }
}

fn resolve_api_key(
    app: &AppHandle,
    provider_id: &str,
    api_key_override: Option<&str>,
) -> Result<String> {
    if let Some(api_key_override) = api_key_override {
        let trimmed = api_key_override.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    get_provider_api_key(app, provider_id)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            anyhow!("Add an API key for {provider_id} in Settings before using this provider.")
        })
}

fn normalize_message_history(messages: &[ScratchpadMessage]) -> Vec<ScratchpadMessage> {
    const MAX_MESSAGES: usize = 12;
    if messages.len() <= MAX_MESSAGES {
        messages.to_vec()
    } else {
        messages[messages.len() - MAX_MESSAGES..].to_vec()
    }
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    let truncated: String = trimmed.chars().take(max_chars).collect();
    if trimmed.chars().count() > max_chars {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn plain_text_to_html(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "<p></p>".to_string();
    }

    if trimmed.contains("<p") || trimmed.contains("<div") || trimmed.contains("<br") {
        return trimmed.to_string();
    }

    let normalized = trimmed.replace("\r\n", "\n");
    let paragraphs = normalized
        .split("\n\n")
        .map(|paragraph| {
            paragraph
                .lines()
                .map(escape_html)
                .collect::<Vec<_>>()
                .join("<br />")
        })
        .filter(|paragraph| !paragraph.trim().is_empty())
        .map(|paragraph| format!("<p>{paragraph}</p>"))
        .collect::<Vec<_>>();

    if paragraphs.is_empty() {
        "<p></p>".to_string()
    } else {
        paragraphs.join("")
    }
}

fn ensure_manuscript_html(value: &str) -> String {
    if value.trim().is_empty() {
        "<p></p>".to_string()
    } else {
        plain_text_to_html(value)
    }
}

fn selected_chapters(
    snapshot: &ProjectSnapshot,
    context: &ScratchpadProjectContext,
) -> Vec<Chapter> {
    snapshot
        .chapters
        .iter()
        .filter(|chapter| context.chapter_ids.contains(&chapter.id))
        .cloned()
        .collect()
}

fn selected_scenes(snapshot: &ProjectSnapshot, context: &ScratchpadProjectContext) -> Vec<Scene> {
    snapshot
        .scenes
        .iter()
        .filter(|scene| context.scene_ids.contains(&scene.id))
        .map(|scene| {
            let mut scene = scene.clone();
            scene.manuscript_text = truncate_text(&scene.manuscript_text, 3000);
            scene
        })
        .collect()
}

fn selected_characters(
    snapshot: &ProjectSnapshot,
    context: &ScratchpadProjectContext,
) -> Vec<Character> {
    snapshot
        .characters
        .iter()
        .filter(|character| context.character_ids.contains(&character.id))
        .cloned()
        .collect()
}

fn build_project_brief_context(snapshot: &ProjectSnapshot) -> Value {
    json!({
        "id": snapshot.project.id,
        "title": snapshot.project.title,
        "logline": snapshot.project.logline,
        "premise": snapshot.project.premise,
        "centralConflict": snapshot.project.central_conflict,
        "thematicIntent": snapshot.project.thematic_intent,
        "endingDirection": snapshot.project.ending_direction,
        "genre": snapshot.project.genre,
        "tone": snapshot.project.tone,
        "audienceNotes": snapshot.project.audience_notes,
    })
}

fn push_story_brief_field(lines: &mut Vec<String>, label: &str, value: &str) {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        lines.push(format!("- {}: {}", label, trimmed));
    }
}

fn build_structured_story_brief_guidance(snapshot: &ProjectSnapshot, action: &str) -> String {
    let project = &snapshot.project;
    let mut anchors = Vec::new();

    match action {
        "story-diagnose-structure" => {
            push_story_brief_field(&mut anchors, "Logline", &project.logline);
            push_story_brief_field(&mut anchors, "Premise", &project.premise);
            push_story_brief_field(&mut anchors, "Central conflict", &project.central_conflict);
            push_story_brief_field(&mut anchors, "Thematic intent", &project.thematic_intent);
            push_story_brief_field(&mut anchors, "Ending direction", &project.ending_direction);
            push_story_brief_field(&mut anchors, "Genre", &project.genre);
            push_story_brief_field(&mut anchors, "Tone", &project.tone);
        }
        "chapter-propose-scenes" => {
            push_story_brief_field(&mut anchors, "Logline", &project.logline);
            push_story_brief_field(&mut anchors, "Premise", &project.premise);
            push_story_brief_field(&mut anchors, "Central conflict", &project.central_conflict);
            push_story_brief_field(&mut anchors, "Thematic intent", &project.thematic_intent);
            push_story_brief_field(&mut anchors, "Ending direction", &project.ending_direction);
            push_story_brief_field(&mut anchors, "Genre", &project.genre);
            push_story_brief_field(&mut anchors, "Tone", &project.tone);
        }
        "scene-generate-beats" | "scene-expand-draft" => {
            push_story_brief_field(&mut anchors, "Premise", &project.premise);
            push_story_brief_field(&mut anchors, "Central conflict", &project.central_conflict);
            push_story_brief_field(&mut anchors, "Thematic intent", &project.thematic_intent);
            push_story_brief_field(&mut anchors, "Ending direction", &project.ending_direction);
            push_story_brief_field(&mut anchors, "Genre", &project.genre);
            push_story_brief_field(&mut anchors, "Tone", &project.tone);
        }
        _ => {}
    }

    let usage_note = match action {
        "story-diagnose-structure" => {
            "Evaluate the spine not just for generic structure, but for whether its current chapters and scenes seem positioned to deliver on these saved story-intent anchors when relevant."
        }
        "chapter-propose-scenes" => {
            "Use the saved story brief as a story-intent north star. Propose scenes that help this chapter advance the premise and central conflict while staying compatible with the thematic intent, ending direction, genre, and tone when those anchors matter."
        }
        "scene-generate-beats" => {
            "Use the saved story brief to shape what this scene should be doing beneath the surface. Let the brief influence the scene pressure, reversals, reveals, and exit change when that creates a clearer line back to the overall story intent."
        }
        "scene-expand-draft" => {
            "Use the saved story brief to guide emphasis, emotional texture, and prose choices. Let genre and tone affect the page feel, and let premise, conflict, thematic intent, and ending direction influence what the scene highlights when relevant."
        }
        _ => "Use the saved story brief when it materially helps the requested action.",
    };

    if anchors.is_empty() {
        return format!(
            "Saved story brief guidance:\n\
             - {}\n\
             - No additional saved story brief anchors are currently filled beyond the project title, so fall back to the supplied structure and local planning context.",
            usage_note
        );
    }

    format!(
        "Saved story brief guidance:\n\
         - {}\n\
         {}\n\
         - Ignore blank or irrelevant story brief fields instead of forcing every field into the output.",
        usage_note,
        anchors.join("\n")
    )
}

fn build_context_blob(snapshot: &ProjectSnapshot, context: &ScratchpadProjectContext) -> String {
    serde_json::to_string_pretty(&json!({
        "project": build_project_brief_context(snapshot),
        "selectedChapters": selected_chapters(snapshot, context),
        "selectedScenes": selected_scenes(snapshot, context),
        "selectedCharacters": selected_characters(snapshot, context),
    }))
    .unwrap_or_else(|_| "{}".to_string())
}

fn truncated_scene_for_context(scene: &Scene) -> Scene {
    let mut scene = scene.clone();
    scene.manuscript_text = truncate_text(&scene.manuscript_text, 1500);
    scene
}

fn build_chapter_structured_context(
    snapshot: &ProjectSnapshot,
    chapter_id: &str,
) -> Result<String> {
    let chapter = snapshot
        .chapters
        .iter()
        .find(|chapter| chapter.id == chapter_id)
        .cloned()
        .ok_or_else(|| anyhow!("The requested chapter no longer exists."))?;

    let chapter_scenes = snapshot
        .scenes
        .iter()
        .filter(|scene| scene.chapter_id.as_deref() == Some(chapter_id))
        .cloned()
        .map(|scene| truncated_scene_for_context(&scene))
        .collect::<Vec<_>>();

    let previous_chapter = snapshot
        .chapters
        .iter()
        .filter(|candidate| candidate.order_index < chapter.order_index)
        .max_by_key(|candidate| candidate.order_index)
        .cloned();

    let next_chapter = snapshot
        .chapters
        .iter()
        .filter(|candidate| candidate.order_index > chapter.order_index)
        .min_by_key(|candidate| candidate.order_index)
        .cloned();

    let mut relevant_character_ids = chapter.character_focus_ids.clone();
    for scene in &chapter_scenes {
        if let Some(pov_character_id) = &scene.pov_character_id {
            relevant_character_ids.push(pov_character_id.clone());
        }
        relevant_character_ids.extend(scene.involved_character_ids.clone());
    }
    relevant_character_ids.sort();
    relevant_character_ids.dedup();

    let relevant_characters = snapshot
        .characters
        .iter()
        .filter(|character| relevant_character_ids.contains(&character.id))
        .cloned()
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&json!({
        "project": build_project_brief_context(snapshot),
        "targetChapter": chapter,
        "existingChapterScenes": chapter_scenes,
        "focusedCharacters": relevant_characters,
        "previousChapter": previous_chapter,
        "nextChapter": next_chapter,
    }))
    .context("Failed to serialize chapter planning context.")
}

fn build_scene_structured_context(snapshot: &ProjectSnapshot, scene_id: &str) -> Result<String> {
    let scene = snapshot
        .scenes
        .iter()
        .find(|scene| scene.id == scene_id)
        .cloned()
        .ok_or_else(|| anyhow!("The requested scene no longer exists."))?;

    let chapter = scene
        .chapter_id
        .as_ref()
        .and_then(|chapter_id| {
            snapshot
                .chapters
                .iter()
                .find(|chapter| &chapter.id == chapter_id)
        })
        .cloned();

    let chapter_scenes = snapshot
        .scenes
        .iter()
        .filter(|candidate| candidate.chapter_id == scene.chapter_id)
        .cloned()
        .collect::<Vec<_>>();

    let ordered_chapter_scenes = {
        let mut scenes = chapter_scenes
            .iter()
            .map(truncated_scene_for_context)
            .collect::<Vec<_>>();
        scenes.sort_by_key(|candidate| candidate.order_index);
        scenes
    };

    let current_index = ordered_chapter_scenes
        .iter()
        .position(|candidate| candidate.id == scene.id);
    let previous_scene = current_index
        .and_then(|index| index.checked_sub(1))
        .and_then(|index| ordered_chapter_scenes.get(index))
        .cloned();
    let next_scene = current_index
        .and_then(|index| ordered_chapter_scenes.get(index + 1))
        .cloned();

    let mut relevant_character_ids = scene.involved_character_ids.clone();
    if let Some(pov_character_id) = &scene.pov_character_id {
        relevant_character_ids.push(pov_character_id.clone());
    }
    if let Some(chapter) = &chapter {
        relevant_character_ids.extend(chapter.character_focus_ids.clone());
    }
    relevant_character_ids.sort();
    relevant_character_ids.dedup();

    let related_characters = snapshot
        .characters
        .iter()
        .filter(|character| relevant_character_ids.contains(&character.id))
        .cloned()
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&json!({
        "project": build_project_brief_context(snapshot),
        "chapter": chapter,
        "scene": truncated_scene_for_context(&scene),
        "previousScene": previous_scene,
        "nextScene": next_scene,
        "chapterSceneSequence": ordered_chapter_scenes,
        "relatedCharacters": related_characters,
    }))
    .context("Failed to serialize scene planning context.")
}

fn build_story_scene_context(scene: &Scene) -> Value {
    json!({
        "id": scene.id,
        "chapterId": scene.chapter_id,
        "orderIndex": scene.order_index,
        "title": scene.title,
        "summary": scene.summary,
        "purpose": scene.purpose,
        "beatOutline": truncate_text(&scene.beat_outline, 500),
        "conflict": scene.conflict,
        "outcome": scene.outcome,
        "povCharacterId": scene.pov_character_id,
        "location": scene.location,
        "timeLabel": scene.time_label,
        "involvedCharacterIds": scene.involved_character_ids,
        "continuityTags": scene.continuity_tags,
        "dependencySceneIds": scene.dependency_scene_ids,
    })
}

fn build_story_structured_context(snapshot: &ProjectSnapshot) -> Result<String> {
    let mut ordered_chapters = snapshot.chapters.clone();
    ordered_chapters.sort_by_key(|chapter| chapter.order_index);

    let story_spine = ordered_chapters
        .iter()
        .map(|chapter| {
            let mut chapter_scenes = snapshot
                .scenes
                .iter()
                .filter(|scene| scene.chapter_id.as_deref() == Some(chapter.id.as_str()))
                .cloned()
                .collect::<Vec<_>>();
            chapter_scenes.sort_by_key(|scene| scene.order_index);

            let focused_characters = snapshot
                .characters
                .iter()
                .filter(|character| chapter.character_focus_ids.contains(&character.id))
                .map(|character| {
                    json!({
                        "id": character.id,
                        "name": character.name,
                        "role": character.role,
                        "arcDirection": character.arc_direction,
                    })
                })
                .collect::<Vec<_>>();

            json!({
                "chapter": chapter,
                "sceneSequence": chapter_scenes
                    .iter()
                    .map(build_story_scene_context)
                    .collect::<Vec<_>>(),
                "focusedCharacters": focused_characters,
            })
        })
        .collect::<Vec<_>>();

    let mut unassigned_scenes = snapshot
        .scenes
        .iter()
        .filter(|scene| scene.chapter_id.is_none())
        .cloned()
        .collect::<Vec<_>>();
    unassigned_scenes.sort_by_key(|scene| scene.order_index);

    serde_json::to_string_pretty(&json!({
        "project": build_project_brief_context(snapshot),
        "storySpine": story_spine,
        "unassignedScenes": unassigned_scenes
            .iter()
            .map(build_story_scene_context)
            .collect::<Vec<_>>(),
        "characters": snapshot
            .characters
            .iter()
            .map(|character| {
                json!({
                    "id": character.id,
                    "name": character.name,
                    "role": character.role,
                    "arcDirection": character.arc_direction,
                })
            })
            .collect::<Vec<_>>(),
    }))
    .context("Failed to serialize story structure context.")
}

fn action_brief(action: &str) -> &'static str {
    match action {
        "create-chapters" => "Create or refine chapter-level structure from the pasted material.",
        "create-scenes" => "Break the pasted material into scene-level units with usable metadata.",
        "create-character-card" => {
            "Turn the pasted material into one or more structured character cards."
        }
        "summarize" => "Summarize the pasted material and extract any clearly useful structure.",
        "extract-continuity-notes" => {
            "Extract continuity concerns, reveal order issues, callbacks, and setup/payoff threads."
        }
        _ => "Help the user convert pasted story material into structured writing assets.",
    }
}

fn build_system_prompt(action: &str) -> String {
    format!(
        "You are the NovelForge scratchpad assistant. {action_brief}\n\
Return JSON only with this exact top-level shape:\n\
{{\n\
  \"assistantMessage\": \"short helpful explanation\",\n\
  \"result\": {{\n\
    \"summary\": \"brief summary of what you produced\",\n\
    \"chapters\": [{{\n\
      \"targetChapterId\": null,\n\
      \"title\": \"\",\n\
      \"summary\": \"\",\n\
      \"purpose\": \"\",\n\
      \"majorEvents\": [\"\"],\n\
      \"emotionalMovement\": \"\",\n\
      \"characterFocusIds\": [\"\"],\n\
      \"setupPayoffNotes\": \"\"\n\
    }}],\n\
    \"scenes\": [{{\n\
      \"targetSceneId\": null,\n\
      \"chapterId\": null,\n\
      \"chapterTitleHint\": null,\n\
      \"title\": \"\",\n\
      \"summary\": \"\",\n\
      \"purpose\": \"\",\n\
      \"beatOutline\": \"\",\n\
      \"conflict\": \"\",\n\
      \"outcome\": \"\",\n\
      \"povCharacterId\": null,\n\
      \"location\": \"\",\n\
      \"timeLabel\": \"\",\n\
      \"involvedCharacterIds\": [\"\"],\n\
      \"continuityTags\": [\"\"],\n\
      \"dependencySceneIds\": [\"\"],\n\
      \"manuscriptText\": \"<p></p>\"\n\
    }}],\n\
    \"characters\": [{{\n\
      \"targetCharacterId\": null,\n\
      \"name\": \"\",\n\
      \"role\": \"\",\n\
      \"personalityTraits\": [\"\"],\n\
      \"motivations\": \"\",\n\
      \"fears\": \"\",\n\
      \"worldview\": \"\",\n\
      \"speakingStyle\": \"\",\n\
      \"vocabularyTendencies\": \"\",\n\
      \"speechRhythm\": \"\",\n\
      \"emotionalBaseline\": \"\",\n\
      \"relationships\": [{{\"characterId\": \"\", \"summary\": \"\"}}],\n\
      \"secrets\": \"\",\n\
      \"arcDirection\": \"\",\n\
      \"contradictions\": \"\"\n\
    }}],\n\
    \"continuityNotes\": [\"note\"]\n\
  }}\n\
}}\n\
Rules:\n\
- Keep only fields you can support from the user's material.\n\
- Use empty arrays when a section is not needed.\n\
- Prefer concise, usable drafting structure over long prose.\n\
- For beatOutline, prefer concise beat-by-beat planning over paragraphs.\n\
- If existing ids are available in the context, use them. If not, you may use names/titles in id fields and NovelForge will attempt to resolve them.\n\
- Never invent plot details that contradict the supplied context.\n\
- For manuscriptText, keep any generated prose short and focused.",
        action_brief = action_brief(action)
    )
}

fn build_user_prompt(snapshot: &ProjectSnapshot, input: &RunScratchpadChatInput) -> String {
    format!(
        "Action: {action}\n\
Project context:\n{context}\n\n\
Recent chat history:\n{history}\n\n\
New user input:\n{user_input}",
        action = input.action,
        context = build_context_blob(snapshot, &input.project_context),
        history = normalize_message_history(&input.messages)
            .into_iter()
            .map(|message| format!("[{}] {}", message.role, message.content))
            .collect::<Vec<_>>()
            .join("\n"),
        user_input = input.user_input.trim(),
    )
}

fn structured_action_brief(action: &str) -> &'static str {
    match action {
        "story-diagnose-structure" => {
            "Review the whole story spine for structural gaps, redundancy, and next planning targets in light of the saved story brief."
        }
        "chapter-propose-scenes" => {
            "Propose scene records that help the current chapter fulfill its planning role while staying aligned with the saved story brief."
        }
        "scene-generate-beats" => {
            "Turn the current scene overview into a concise beat outline that stays aligned with the saved story brief."
        }
        "scene-expand-draft" => {
            "Expand the current scene's plan into a rough, reviewable draft that reflects the saved story brief."
        }
        _ => "Help the user generate structured story-planning output.",
    }
}

fn build_structured_system_prompt(action: &str) -> String {
    format!(
        "You are NovelForge's structured planning assistant. {action_brief}\n\
Return JSON only with this exact top-level shape:\n\
{{\n\
  \"assistantMessage\": \"short helpful explanation\",\n\
  \"result\": {{\n\
    \"summary\": \"brief summary of what you produced\",\n\
    \"sceneProposals\": [{{\n\
      \"targetSceneId\": null,\n\
      \"chapterId\": null,\n\
      \"chapterTitleHint\": null,\n\
      \"title\": \"\",\n\
      \"summary\": \"\",\n\
      \"purpose\": \"\",\n\
      \"beatOutline\": \"\",\n\
      \"conflict\": \"\",\n\
      \"outcome\": \"\",\n\
      \"povCharacterId\": null,\n\
      \"location\": \"\",\n\
      \"timeLabel\": \"\",\n\
      \"involvedCharacterIds\": [\"\"],\n\
      \"continuityTags\": [\"\"],\n\
      \"dependencySceneIds\": [\"\"],\n\
      \"manuscriptText\": \"<p></p>\"\n\
    }}],\n\
    \"beatOutline\": \"\",\n\
    \"manuscriptText\": \"\",\n\
    \"storyStructureDiagnostic\": {{\n\
      \"underdefinedChapters\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"chapter\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}],\n\
      \"redundantFunctions\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"scene\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}],\n\
      \"missingTransitions\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"scene\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}],\n\
      \"briefAlignmentNotes\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"alignment\": \"support\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"chapter\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}],\n\
      \"endingDirectionPreparation\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"chapter\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}],\n\
      \"setupPayoffSupport\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"chapter\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}],\n\
      \"nextPlanningTargets\": [{{\n\
        \"title\": \"\",\n\
        \"detail\": \"\",\n\
        \"focus\": null,\n\
        \"related\": [{{ \"kind\": \"chapter\", \"id\": \"\", \"title\": \"\" }}]\n\
      }}]\n\
    }}\n\
  }}\n\
}}\n\
Rules:\n\
- Only fill the field or fields needed for the requested action.\n\
- Leave unused arrays empty and unused strings blank.\n\
- Ground every output in the supplied NovelForge context.\n\
- Treat the saved project story brief as story-intent guidance when it is present and relevant.\n\
- Use only the brief fields that materially help the requested action; ignore blank or noisy ones.\n\
- Do not contradict existing chapter, scene, or character facts.\n\
- For storyStructureDiagnostic entries, use chapter or scene refs whenever the issue points to a specific part of the spine.\n\
- Keep storyStructureDiagnostic entries short, concrete, and review-oriented.\n\
- In briefAlignmentNotes, mention the saved story-brief element only when it adds useful planning signal.\n\
- In briefAlignmentNotes, set alignment to support, weak_support, or risk.\n\
- In endingDirectionPreparation, add 0 to 3 planning-oriented notes about whether the current spine is preparing the saved ending direction only when that ending target is specific enough to matter.\n\
- If the saved brief has no meaningful ending direction, leave endingDirectionPreparation empty.\n\
- In setupPayoffSupport, add 0 to 3 planning-oriented notes about thin setup, expected payoff targets, or groundwork that may need reinforcement when a meaningful setup/payoff thread is apparent.\n\
- If there is not enough evidence of a meaningful setup/payoff thread, leave setupPayoffSupport empty.\n\
- Keep beat outlines concise and line-based.\n\
- Use existing ids when they are present in the context.\n\
- For manuscriptText, return rough-draft HTML using simple <p> paragraphs only.\n\
- Do not add meta commentary outside the JSON object.",
        action_brief = structured_action_brief(action)
    )
}

fn build_structured_user_prompt(
    snapshot: &ProjectSnapshot,
    input: &RunStructuredAIActionInput,
) -> Result<String> {
    let story_brief_guidance = build_structured_story_brief_guidance(snapshot, &input.action);
    let workspace_context = if input.workspace_context.trim().is_empty() {
        String::new()
    } else {
        format!(
            "\n\nUnsaved workspace context. Prefer these values over the saved snapshot when they differ:\n{}",
            input.workspace_context.trim()
        )
    };

    match input.action.as_str() {
        "story-diagnose-structure" => Ok(format!(
            "Action: diagnose the whole story structure.\n\
Context:\n{context}\n\n\
{story_brief_guidance}\n\n\
Task:\n\
- Review the current story spine at the chapter and scene planning level, not as prose critique.\n\
- Evaluate structural concerns in light of the saved story brief where that adds useful signal, especially premise, central conflict, thematic intent, ending direction, genre, and tone when present.\n\
- Do not force every brief field into the diagnosis. Only call out mismatches or missing support when the current spine genuinely seems out of step with the saved story intent.\n\
- Use result.storyStructureDiagnostic.underdefinedChapters for chapters that look thin, underdefined, or weakly supported by their current scenes.\n\
- Use result.storyStructureDiagnostic.redundantFunctions for chapters or scenes that appear to serve the same function without enough escalation or differentiation.\n\
- Use result.storyStructureDiagnostic.missingTransitions for missing handoffs, consequence beats, bridge scenes, or chapter-to-chapter transitions.\n\
- Use result.storyStructureDiagnostic.briefAlignmentNotes for the clearest places where the current spine either supports the saved story brief or seems to underserve it.\n\
- In briefAlignmentNotes, explicitly connect the note to the relevant saved brief anchor when useful, such as premise, central conflict, thematic intent, ending direction, genre, or tone.\n\
- In briefAlignmentNotes, use alignment support when the spine already gives clear concrete evidence of the saved brief, weak_support when the alignment is present but still partial or lightly evidenced, and risk when the spine seems to underserve, drift from, or potentially misread the saved brief.\n\
- Only add a briefAlignmentNote when that alignment label is clearly justified by the current structure and the saved brief.\n\
- Keep briefAlignmentNotes selective and planning-oriented: 0 to 3 entries, only when the saved brief has enough signal.\n\
- If the saved brief is sparse, generic, or not materially relevant to the current structure, leave briefAlignmentNotes empty.\n\
- Use result.storyStructureDiagnostic.endingDirectionPreparation for narrow planning notes about whether the current spine is laying groundwork for the saved ending direction.\n\
- Only add an endingDirectionPreparation note when the saved brief includes a meaningful ending target and the current spine gives enough evidence to judge the setup.\n\
- Keep endingDirectionPreparation selective and review-only: 0 to 3 entries focused on setup, payoff preparation, or missing groundwork rather than rewriting the ending itself.\n\
- If the saved brief has no meaningful ending direction, or the ending target is too generic to use well, leave endingDirectionPreparation empty.\n\
- Use result.storyStructureDiagnostic.setupPayoffSupport for narrow planning notes about setups, promises, callbacks, or likely payoff targets that may need clearer groundwork or stronger support.\n\
- Only add a setupPayoffSupport note when the current structure gives enough evidence of an actual setup/payoff thread, such as a planted promise, a chapter setupPayoffNotes thread, or an implied later resolution.\n\
- Keep setupPayoffSupport selective and review-only: 0 to 3 entries focused on seeding, support, and payoff preparation rather than inventing new plot lines.\n\
- If there is not enough evidence of a meaningful setup/payoff thread, leave setupPayoffSupport empty.\n\
- Use result.storyStructureDiagnostic.nextPlanningTargets for the highest-leverage next planning passes.\n\
- Keep each diagnostic entry concise: a short title, a compact detail note, one focus ref when possible, and optional related refs.\n\
- Prefer chapter refs for chapter-level issues and scene refs for scene-level issues.\n\
- Limit each diagnostic section to the most useful 0 to 4 entries.\n\
- Leave result.sceneProposals empty and result.beatOutline/result.manuscriptText blank for this action.{workspace_context}",
            context = build_story_structured_context(snapshot)?,
            story_brief_guidance = story_brief_guidance,
        )),
        "chapter-propose-scenes" => {
            let chapter_id = input
                .chapter_id
                .as_deref()
                .ok_or_else(|| anyhow!("A chapter id is required for scene proposals."))?;
            Ok(format!(
                "Action: propose scenes for the target chapter.\n\
Target chapter id: {chapter_id}\n\
Context:\n{context}\n\n\
{story_brief_guidance}\n\n\
Task:\n\
- Propose 2 to 5 scenes that belong in this specific chapter.\n\
- Use the target chapter id for every sceneProposals[].chapterId value.\n\
- Build on the chapter intent and current chapter scene list instead of duplicating what already exists.\n\
- Make the proposals feel like they belong to this story, not just this slot in the structure. Use the saved story brief to help choose scenes that advance the premise and central conflict, while supporting thematic intent, ending direction, genre, and tone only where those anchors are useful.\n\
- Avoid proposing scenes that satisfy chapter structure mechanically but drift away from the saved story intent.\n\
- Keep each beatOutline concise, one beat per line.\n\
- Leave result.beatOutline and result.manuscriptText blank for this action.\n\
- Set manuscriptText inside each scene proposal to <p></p> unless a tiny opening sample is truly useful.{workspace_context}",
                context = build_chapter_structured_context(snapshot, chapter_id)?,
                story_brief_guidance = story_brief_guidance,
            ))
        }
        "scene-generate-beats" => {
            let scene_id = input
                .scene_id
                .as_deref()
                .ok_or_else(|| anyhow!("A scene id is required to generate beats."))?;
            Ok(format!(
                "Action: generate a beat outline for the target scene.\n\
Target scene id: {scene_id}\n\
Context:\n{context}\n\n\
{story_brief_guidance}\n\n\
Task:\n\
- Write a beat outline for this scene using the overview, chapter placement, and character pressure.\n\
- Produce 4 to 7 beats, one beat per line, in planning language rather than prose paragraphs.\n\
- Focus on progression, reversals, reveals, and exit change.\n\
- Use the saved story brief to sharpen the beat choices, especially premise, central conflict, thematic intent, ending direction, genre, and tone when those anchors help this particular scene.\n\
- Do not bolt theme or genre labels onto every beat. Let the brief influence subtext, pressure, and the kind of turn the scene creates.\n\
- Leave result.sceneProposals empty and result.manuscriptText blank for this action.{workspace_context}",
                context = build_scene_structured_context(snapshot, scene_id)?,
                story_brief_guidance = story_brief_guidance,
            ))
        }
        "scene-expand-draft" => {
            let scene_id = input
                .scene_id
                .as_deref()
                .ok_or_else(|| anyhow!("A scene id is required to expand a draft."))?;
            Ok(format!(
                "Action: expand the target scene into a rough draft.\n\
Target scene id: {scene_id}\n\
Context:\n{context}\n\n\
{story_brief_guidance}\n\n\
Task:\n\
- Expand the current scene into rough-draft prose based primarily on the overview and beat outline.\n\
- Return simple HTML paragraphs in result.manuscriptText using <p> tags only.\n\
- Keep it compact and provisional: 4 to 8 short paragraphs, enough to create momentum without overpolishing.\n\
- Preserve the scene's existing purpose, conflict, and outcome.\n\
- Let the saved story brief guide what the draft emphasizes: premise and conflict should shape what feels important, thematic intent and ending direction should shape the scene's deeper meaning where natural, and genre/tone should shape the page feel.\n\
- Avoid heavy exposition about the brief. The alignment should mostly show up through scene choices, emotional texture, and the kind of language the draft uses.\n\
- Leave result.sceneProposals empty and result.beatOutline blank for this action.{workspace_context}",
                context = build_scene_structured_context(snapshot, scene_id)?,
                story_brief_guidance = story_brief_guidance,
            ))
        }
        _ => Err(anyhow!("Unsupported structured AI action: {}", input.action)),
    }
}

fn extract_json_payload(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(stripped) = trimmed
        .strip_prefix("```json")
        .and_then(|value| value.strip_suffix("```"))
    {
        return stripped.trim().to_string();
    }

    if let Some(stripped) = trimmed
        .strip_prefix("```")
        .and_then(|value| value.strip_suffix("```"))
    {
        return stripped.trim().to_string();
    }

    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    match (start, end) {
        (Some(start), Some(end)) if start <= end => trimmed[start..=end].to_string(),
        _ => trimmed.to_string(),
    }
}

fn map_scene_proposal(scene: RawScratchpadScene) -> Option<SceneProposal> {
    if scene.title.trim().is_empty() {
        return None;
    }

    Some(SceneProposal {
        target_scene_id: scene.target_scene_id,
        chapter_id: scene.chapter_id,
        chapter_title_hint: scene.chapter_title_hint,
        title: scene.title,
        summary: scene.summary,
        purpose: scene.purpose,
        beat_outline: scene.beat_outline,
        conflict: scene.conflict,
        outcome: scene.outcome,
        pov_character_id: scene.pov_character_id,
        location: scene.location,
        time_label: scene.time_label,
        involved_character_ids: scene.involved_character_ids,
        continuity_tags: scene.continuity_tags,
        dependency_scene_ids: scene.dependency_scene_ids,
        manuscript_text: ensure_manuscript_html(&scene.manuscript_text),
    })
}

fn map_scene_proposals(scenes: Vec<RawScratchpadScene>) -> Vec<SceneProposal> {
    scenes.into_iter().filter_map(map_scene_proposal).collect()
}

fn map_result(raw: RawScratchpadResult) -> ScratchpadResult {
    ScratchpadResult {
        summary: raw.summary,
        chapters: raw
            .chapters
            .into_iter()
            .filter(|chapter| !chapter.title.trim().is_empty())
            .map(|chapter| ChapterProposal {
                target_chapter_id: chapter.target_chapter_id,
                title: chapter.title,
                summary: chapter.summary,
                purpose: chapter.purpose,
                major_events: chapter.major_events,
                emotional_movement: chapter.emotional_movement,
                character_focus_ids: chapter.character_focus_ids,
                setup_payoff_notes: chapter.setup_payoff_notes,
            })
            .collect(),
        scenes: map_scene_proposals(raw.scenes),
        characters: raw
            .characters
            .into_iter()
            .filter(|character| !character.name.trim().is_empty())
            .map(|character| CharacterProposal {
                target_character_id: character.target_character_id,
                name: character.name,
                role: character.role,
                personality_traits: character.personality_traits,
                motivations: character.motivations,
                fears: character.fears,
                worldview: character.worldview,
                speaking_style: character.speaking_style,
                vocabulary_tendencies: character.vocabulary_tendencies,
                speech_rhythm: character.speech_rhythm,
                emotional_baseline: character.emotional_baseline,
                relationships: character.relationships,
                secrets: character.secrets,
                arc_direction: character.arc_direction,
                contradictions: character.contradictions,
            })
            .collect(),
        continuity_notes: raw.continuity_notes,
    }
}

fn map_story_reference(reference: RawDomainObjectRef) -> Option<crate::models::DomainObjectRef> {
    let kind = reference.kind.trim().to_string();
    let id = reference.id.trim().to_string();

    if kind.is_empty() || id.is_empty() {
        return None;
    }

    Some(crate::models::DomainObjectRef {
        kind,
        id,
        title: reference.title.and_then(|title| {
            let trimmed = title.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }),
    })
}

fn map_story_diagnostic_entry(raw: RawStoryDiagnosticEntry) -> Option<StoryDiagnosticEntry> {
    let title = raw.title.trim().to_string();
    if title.is_empty() {
        return None;
    }

    Some(StoryDiagnosticEntry {
        title,
        detail: raw.detail.trim().to_string(),
        focus: raw.focus.and_then(map_story_reference),
        related: raw
            .related
            .into_iter()
            .filter_map(map_story_reference)
            .collect(),
    })
}

fn map_story_brief_alignment(raw: &str) -> StoryBriefAlignment {
    let normalized = raw
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .replace(' ', "_");
    match normalized.as_str() {
        "support" => StoryBriefAlignment::Support,
        "risk" => StoryBriefAlignment::Risk,
        _ => StoryBriefAlignment::WeakSupport,
    }
}

fn map_story_brief_alignment_note(raw: RawStoryDiagnosticEntry) -> Option<StoryBriefAlignmentNote> {
    let title = raw.title.trim().to_string();
    if title.is_empty() {
        return None;
    }

    Some(StoryBriefAlignmentNote {
        title,
        detail: raw.detail.trim().to_string(),
        alignment: map_story_brief_alignment(&raw.alignment),
        focus: raw.focus.and_then(map_story_reference),
        related: raw
            .related
            .into_iter()
            .filter_map(map_story_reference)
            .collect(),
    })
}

fn map_story_structure_diagnostic(raw: RawStoryStructureDiagnostic) -> StoryStructureDiagnostic {
    StoryStructureDiagnostic {
        underdefined_chapters: raw
            .underdefined_chapters
            .into_iter()
            .filter_map(map_story_diagnostic_entry)
            .collect(),
        redundant_functions: raw
            .redundant_functions
            .into_iter()
            .filter_map(map_story_diagnostic_entry)
            .collect(),
        missing_transitions: raw
            .missing_transitions
            .into_iter()
            .filter_map(map_story_diagnostic_entry)
            .collect(),
        brief_alignment_notes: raw
            .brief_alignment_notes
            .into_iter()
            .filter_map(map_story_brief_alignment_note)
            .collect(),
        ending_direction_preparation: raw
            .ending_direction_preparation
            .into_iter()
            .filter_map(map_story_diagnostic_entry)
            .collect(),
        setup_payoff_support: raw
            .setup_payoff_support
            .into_iter()
            .filter_map(map_story_diagnostic_entry)
            .collect(),
        next_planning_targets: raw
            .next_planning_targets
            .into_iter()
            .filter_map(map_story_diagnostic_entry)
            .collect(),
    }
}

fn empty_structured_result() -> StructuredAIResult {
    StructuredAIResult {
        summary: String::new(),
        scene_proposals: vec![],
        beat_outline: String::new(),
        manuscript_text: String::new(),
        story_structure_diagnostic: StoryStructureDiagnostic::default(),
    }
}

fn parse_scratchpad_response(raw_text: &str) -> (String, ScratchpadResult) {
    let payload = extract_json_payload(raw_text);
    match serde_json::from_str::<RawScratchpadEnvelope>(&payload) {
        Ok(parsed) => {
            let result = map_result(parsed.result);
            let assistant_message = if parsed.assistant_message.trim().is_empty() {
                if result.summary.trim().is_empty() {
                    "I reviewed the material and prepared a structured result for you to inspect."
                        .to_string()
                } else {
                    result.summary.clone()
                }
            } else {
                parsed.assistant_message
            };
            (assistant_message, result)
        }
        Err(_) => (
            raw_text.trim().to_string(),
            ScratchpadResult {
                summary: String::new(),
                chapters: vec![],
                scenes: vec![],
                characters: vec![],
                continuity_notes: vec![],
            },
        ),
    }
}

fn parse_structured_action_response(action: &str, raw_text: &str) -> (String, StructuredAIResult) {
    let payload = extract_json_payload(raw_text);
    match serde_json::from_str::<RawStructuredActionEnvelope>(&payload) {
        Ok(parsed) => {
            let result = StructuredAIResult {
                summary: parsed.result.summary,
                scene_proposals: map_scene_proposals(parsed.result.scene_proposals),
                beat_outline: parsed.result.beat_outline.trim().to_string(),
                manuscript_text: if parsed.result.manuscript_text.trim().is_empty() {
                    String::new()
                } else {
                    ensure_manuscript_html(&parsed.result.manuscript_text)
                },
                story_structure_diagnostic: map_story_structure_diagnostic(
                    parsed.result.story_structure_diagnostic,
                ),
            };
            let assistant_message = if parsed.assistant_message.trim().is_empty() {
                if result.summary.trim().is_empty() {
                    "I prepared a structured result for review.".to_string()
                } else {
                    result.summary.clone()
                }
            } else {
                parsed.assistant_message
            };
            (assistant_message, result)
        }
        Err(_) => {
            let trimmed = raw_text.trim().to_string();
            let fallback_result = match action {
                "scene-generate-beats" => StructuredAIResult {
                    summary: String::new(),
                    scene_proposals: vec![],
                    beat_outline: trimmed.clone(),
                    manuscript_text: String::new(),
                    story_structure_diagnostic: StoryStructureDiagnostic::default(),
                },
                "scene-expand-draft" => StructuredAIResult {
                    summary: String::new(),
                    scene_proposals: vec![],
                    beat_outline: String::new(),
                    manuscript_text: ensure_manuscript_html(&trimmed),
                    story_structure_diagnostic: StoryStructureDiagnostic::default(),
                },
                _ => empty_structured_result(),
            };
            (trimmed, fallback_result)
        }
    }
}

async fn send_openai_compatible_request(
    endpoint: &str,
    api_key: &str,
    model_id: &str,
    system_prompt: &str,
    messages: &[ScratchpadMessage],
    user_prompt: &str,
    extra_headers: &[(&str, &str)],
) -> Result<String> {
    let client = Client::new();
    let mut request_messages = vec![OpenAIStyleMessage {
        role: "system".to_string(),
        content: system_prompt.to_string(),
    }];

    for message in normalize_message_history(messages) {
        request_messages.push(OpenAIStyleMessage {
            role: message.role,
            content: message.content,
        });
    }

    request_messages.push(OpenAIStyleMessage {
        role: "user".to_string(),
        content: user_prompt.to_string(),
    });

    let mut request = client
        .post(endpoint)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&OpenAIStyleRequest {
            model: model_id.to_string(),
            messages: request_messages,
            temperature: 0.3,
        });

    for (name, value) in extra_headers {
        request = request.header(*name, *value);
    }

    let response: Value = request
        .send()
        .await
        .context("Failed to contact the provider.")?
        .error_for_status()
        .context("The provider rejected the request.")?
        .json()
        .await
        .context("Failed to decode the provider response.")?;

    response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(|content| content.to_string())
        .or_else(|| {
            response
                .pointer("/choices/0/message/content/0/text")
                .and_then(Value::as_str)
                .map(|content| content.to_string())
        })
        .ok_or_else(|| anyhow!("The provider returned an unexpected response shape."))
}

async fn send_gemini_request(
    api_key: &str,
    model_id: &str,
    system_prompt: &str,
    messages: &[ScratchpadMessage],
    user_prompt: &str,
    response_mime_type: &str,
) -> Result<String> {
    let client = Client::new();
    let contents = normalize_message_history(messages)
        .into_iter()
        .map(|message| GeminiContent {
            role: if message.role == "assistant" {
                "model".to_string()
            } else {
                "user".to_string()
            },
            parts: vec![GeminiPart {
                text: message.content,
            }],
        })
        .chain(std::iter::once(GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart {
                text: user_prompt.to_string(),
            }],
        }))
        .collect::<Vec<_>>();

    let response: Value = client
        .post(format!(
            "{GEMINI_API_BASE}/models/{model_id}:generateContent?key={api_key}"
        ))
        .header(CONTENT_TYPE, "application/json")
        .json(&GeminiRequest {
            system_instruction: GeminiInstruction {
                parts: vec![GeminiPart {
                    text: system_prompt.to_string(),
                }],
            },
            contents,
            generation_config: GeminiGenerationConfig {
                temperature: 0.3,
                response_mime_type: response_mime_type.to_string(),
            },
        })
        .send()
        .await
        .context("Failed to contact Gemini.")?
        .error_for_status()
        .context("Gemini rejected the request.")?
        .json()
        .await
        .context("Failed to decode the Gemini response.")?;

    response
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(Value::as_str)
        .map(|text| text.to_string())
        .ok_or_else(|| anyhow!("Gemini returned an unexpected response shape."))
}

async fn send_provider_request(
    app: &AppHandle,
    provider_id: &str,
    model_id: &str,
    system_prompt: &str,
    messages: &[ScratchpadMessage],
    user_prompt: &str,
    api_key_override: Option<&str>,
    response_mime_type: &str,
) -> Result<String> {
    let api_key = resolve_api_key(app, provider_id, api_key_override)?;

    match provider_id {
        "gemini" => {
            send_gemini_request(
                &api_key,
                model_id,
                system_prompt,
                messages,
                user_prompt,
                response_mime_type,
            )
            .await
        }
        "groq" => {
            send_openai_compatible_request(
                GROQ_API_URL,
                &api_key,
                model_id,
                system_prompt,
                messages,
                user_prompt,
                &[],
            )
            .await
        }
        "openrouter" => {
            send_openai_compatible_request(
                OPENROUTER_API_URL,
                &api_key,
                model_id,
                system_prompt,
                messages,
                user_prompt,
                &[
                    ("HTTP-Referer", "https://novelforge.local"),
                    ("X-Title", "NovelForge"),
                ],
            )
            .await
        }
        _ => Err(anyhow!("Unsupported AI provider: {provider_id}")),
    }
}

pub async fn test_provider_connection(
    app: &AppHandle,
    input: TestProviderConnectionInput,
) -> Result<ProviderConnectionResult> {
    let response = send_provider_request(
        app,
        &input.provider_id,
        &input.model_id,
        "You are testing a provider connection for NovelForge. Reply with exactly: ok",
        &[],
        "Reply with exactly: ok",
        input.api_key_override.as_deref(),
        "text/plain",
    )
    .await?;

    Ok(ProviderConnectionResult {
        provider_id: input.provider_id,
        model_id: input.model_id,
        success: true,
        message: format!(
            "Provider responded successfully: {}",
            truncate_text(&response, 120)
        ),
    })
}

pub async fn run_scratchpad_chat(
    app: &AppHandle,
    snapshot: &ProjectSnapshot,
    input: RunScratchpadChatInput,
) -> Result<ScratchpadChatResponse> {
    let raw_response = send_provider_request(
        app,
        &input.provider_id,
        &input.model_id,
        &build_system_prompt(&input.action),
        &input.messages,
        &build_user_prompt(snapshot, &input),
        None,
        "application/json",
    )
    .await?;

    let (assistant_text, result) = parse_scratchpad_response(&raw_response);

    Ok(ScratchpadChatResponse {
        provider_id: input.provider_id,
        model_id: input.model_id,
        assistant_message: ScratchpadMessage {
            id: format!("scratchpad-message-{}", uuid::Uuid::new_v4()),
            role: "assistant".to_string(),
            content: assistant_text,
            created_at: now_iso(),
            action: Some(input.action),
        },
        result,
    })
}

pub async fn run_structured_ai_action(
    app: &AppHandle,
    snapshot: &ProjectSnapshot,
    input: RunStructuredAIActionInput,
) -> Result<StructuredAIResponse> {
    let raw_response = send_provider_request(
        app,
        &input.provider_id,
        &input.model_id,
        &build_structured_system_prompt(&input.action),
        &[],
        &build_structured_user_prompt(snapshot, &input)?,
        None,
        "application/json",
    )
    .await?;

    let (assistant_message, result) =
        parse_structured_action_response(&input.action, &raw_response);

    Ok(StructuredAIResponse {
        provider_id: input.provider_id,
        model_id: input.model_id,
        action: input.action,
        assistant_message,
        result,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        AutosaveState, PanelLayout, Project, ProjectSettings, ProjectState, ViewFilters,
    };

    fn sample_project_snapshot() -> ProjectSnapshot {
        let timestamp = "2026-03-15T00:00:00.000Z".to_string();

        ProjectSnapshot {
            project: Project {
                id: "project-ashen-sky".to_string(),
                title: "Ashen Sky".to_string(),
                logline: "A failed smuggler has one week to escort a living star-map through a collapsing empire.".to_string(),
                premise: "A disgraced smuggler becomes guardian to a living star-map that could redraw power across a dying empire.".to_string(),
                central_conflict: "Ava must keep the map alive and moving while every faction around her wants to own, weaponize, or silence it.".to_string(),
                thematic_intent: "Test whether responsibility can become an act of freedom instead of another chain.".to_string(),
                ending_direction: "Aim for a costly but hopeful ending where Ava chooses stewardship over escape.".to_string(),
                genre: "Science-fantasy adventure".to_string(),
                tone: "Tense, intimate, and wonder-struck under pressure.".to_string(),
                audience_notes: "Adult crossover readers who want high-stakes plotting with character-forward emotional turns.".to_string(),
                schema_version: 3,
                settings: ProjectSettings {
                    autosave_interval_ms: 1500,
                    auto_analyze: true,
                    editor_font_scale: 1.0,
                },
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
                last_opened_at: timestamp.clone(),
            },
            chapters: vec![Chapter {
                id: "chapter-1".to_string(),
                project_id: "project-ashen-sky".to_string(),
                title: "Chapter 1: The Wrong Package".to_string(),
                summary: "Ava accepts a courier job she does not understand.".to_string(),
                purpose: "Launch the novel's central threat and lock Ava into the mission."
                    .to_string(),
                major_events: vec!["Ava takes the job".to_string()],
                emotional_movement: "Cynicism to alarm".to_string(),
                character_focus_ids: vec!["char-ava".to_string()],
                setup_payoff_notes: "The map hums when Ava lies.".to_string(),
                order_index: 0,
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            }],
            scenes: vec![Scene {
                id: "scene-1".to_string(),
                project_id: "project-ashen-sky".to_string(),
                chapter_id: Some("chapter-1".to_string()),
                order_index: 0,
                title: "Dock Nine Exchange".to_string(),
                summary: "Ava meets the client and realizes the cargo is alive.".to_string(),
                purpose: "Inciting incident".to_string(),
                beat_outline:
                    "Ava meets the client at Dock Nine.\nThe crate reacts to her touch."
                        .to_string(),
                conflict: "Ava wants a quick payout; the client keeps withholding facts."
                    .to_string(),
                outcome: "Ava takes the package anyway.".to_string(),
                pov_character_id: Some("char-ava".to_string()),
                location: "Dock Nine".to_string(),
                time_label: "Night".to_string(),
                involved_character_ids: vec!["char-ava".to_string()],
                continuity_tags: vec!["star-map".to_string()],
                dependency_scene_ids: vec![],
                manuscript_text: "<p>Ava hated jobs that breathed.</p>".to_string(),
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            }],
            characters: vec![Character {
                id: "char-ava".to_string(),
                project_id: "project-ashen-sky".to_string(),
                name: "Ava Voss".to_string(),
                role: "Protagonist".to_string(),
                personality_traits: vec!["defensive".to_string()],
                motivations: "Clear her family debt and stop running.".to_string(),
                fears: "Becoming responsible for something she cannot save.".to_string(),
                worldview: "Systems are built to crush the people who trust them.".to_string(),
                speaking_style: "Dry, clipped, reactive.".to_string(),
                vocabulary_tendencies: "Short concrete nouns.".to_string(),
                speech_rhythm: "Fast when cornered.".to_string(),
                emotional_baseline: "Guarded vigilance.".to_string(),
                relationships: vec![Relationship {
                    character_id: "char-ava".to_string(),
                    summary: "Knows herself badly but acts anyway.".to_string(),
                }],
                secrets: "She once betrayed a crew to save her brother.".to_string(),
                arc_direction: "From self-protective survival to chosen responsibility."
                    .to_string(),
                contradictions:
                    "Claims she does not care, repeatedly risks herself for strangers."
                        .to_string(),
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            }],
            suggestions: vec![],
            project_state: ProjectState {
                project_id: "project-ashen-sky".to_string(),
                last_route: "/story".to_string(),
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
                    last_saved_at: Some(timestamp),
                },
                analysis_queue: vec![],
                last_full_scan_at: None,
            },
        }
    }

    fn sample_structured_input(action: &str) -> RunStructuredAIActionInput {
        RunStructuredAIActionInput {
            project_id: "project-ashen-sky".to_string(),
            provider_id: "gemini".to_string(),
            model_id: "gemini-2.5-flash".to_string(),
            action: action.to_string(),
            chapter_id: Some("chapter-1".to_string()),
            scene_id: Some("scene-1".to_string()),
            workspace_context: String::new(),
        }
    }

    #[test]
    fn parser_extracts_structured_scratchpad_payload() {
        let raw = r#"
```json
{
  "assistantMessage": "Built a chapter spine.",
  "result": {
    "summary": "Structured your opening chapters.",
    "chapters": [
      {
        "title": "Chapter 1",
        "summary": "Opening move",
        "purpose": "Set up the hook",
        "majorEvents": ["Signal appears"],
        "emotionalMovement": "Calm to fear",
        "characterFocusIds": [],
        "setupPayoffNotes": "The beacon should matter later."
      }
    ],
    "scenes": [],
    "characters": [],
    "continuityNotes": ["Track the first mention of the signal."]
  }
}
```
"#;

        let (assistant_message, result) = parse_scratchpad_response(raw);
        assert_eq!(assistant_message, "Built a chapter spine.");
        assert_eq!(result.chapters.len(), 1);
        assert_eq!(result.continuity_notes.len(), 1);
    }

    #[test]
    fn parser_falls_back_to_plain_text_when_json_is_missing() {
        let (assistant_message, result) =
            parse_scratchpad_response("This is plain text, not JSON.");

        assert_eq!(assistant_message, "This is plain text, not JSON.");
        assert!(result.chapters.is_empty());
        assert!(result.scenes.is_empty());
        assert!(result.characters.is_empty());
    }

    #[test]
    fn structured_parser_maps_scene_proposals() {
        let raw = r#"
{
  "assistantMessage": "Proposed three scenes.",
  "result": {
    "summary": "These scenes escalate the chapter.",
    "sceneProposals": [
      {
        "chapterId": "chapter-1",
        "title": "Pressure at the Gate",
        "summary": "A checkpoint forces a riskier plan.",
        "purpose": "Escalate the chapter",
        "beatOutline": "Checkpoint stalls the team\nAva spots the trap\nThey commit to a bluff",
        "conflict": "The guard starts recognizing details.",
        "outcome": "They get through, but barely.",
        "manuscriptText": "<p></p>"
      }
    ],
    "beatOutline": "",
    "manuscriptText": ""
  }
}
"#;

        let (assistant_message, result) =
            parse_structured_action_response("chapter-propose-scenes", raw);

        assert_eq!(assistant_message, "Proposed three scenes.");
        assert_eq!(result.scene_proposals.len(), 1);
        assert_eq!(
            result.scene_proposals[0].chapter_id,
            Some("chapter-1".to_string())
        );
    }

    #[test]
    fn structured_parser_maps_story_structure_diagnostics() {
        let raw = r#"
{
  "assistantMessage": "Reviewed the whole spine.",
  "result": {
    "summary": "Chapter 2 needs a clearer handoff.",
    "sceneProposals": [],
    "beatOutline": "",
    "manuscriptText": "",
    "storyStructureDiagnostic": {
      "underdefinedChapters": [
        {
          "title": "Chapter 2 lacks a sharper job",
          "detail": "The chapter pressure is present, but the chapter-level outcome is still vague.",
          "focus": { "kind": "chapter", "id": "chapter-2", "title": "Chapter 2: Border Sparks" },
          "related": [{ "kind": "scene", "id": "scene-3", "title": "Checkpoint Lanterns" }]
        }
      ],
      "redundantFunctions": [],
      "missingTransitions": [
        {
          "title": "Bridge the reveal into the border check",
          "detail": "A consequence beat may help the emotional carryover.",
          "focus": { "kind": "scene", "id": "scene-3", "title": "Checkpoint Lanterns" },
          "related": [{ "kind": "scene", "id": "scene-2", "title": "The Crate Speaks" }]
        }
      ],
      "briefAlignmentNotes": [
        {
          "title": "Chapter 2 under-supports Ava's responsibility turn",
          "detail": "The checkpoint pressure fits the premise, but the spine still gives limited evidence of Ava choosing stewardship over escape.",
          "alignment": "risk",
          "focus": { "kind": "chapter", "id": "chapter-2", "title": "Chapter 2: Border Sparks" },
          "related": [{ "kind": "scene", "id": "scene-3", "title": "Checkpoint Lanterns" }]
        }
      ],
      "endingDirectionPreparation": [
        {
          "title": "Chapter 2 is not yet preparing Ava's later stewardship choice",
          "detail": "The border material escalates danger, but the spine still needs earlier groundwork for Ava choosing stewardship over escape by the ending.",
          "focus": { "kind": "chapter", "id": "chapter-2", "title": "Chapter 2: Border Sparks" },
          "related": [{ "kind": "scene", "id": "scene-3", "title": "Checkpoint Lanterns" }]
        }
      ],
      "setupPayoffSupport": [
        {
          "title": "Chapter 2 only lightly seeds Rian's iron vulnerability payoff",
          "detail": "The chapter notes imply Rian's iron pain should matter later, but the current spine still gives that thread limited visible groundwork.",
          "focus": { "kind": "chapter", "id": "chapter-2", "title": "Chapter 2: Border Sparks" },
          "related": [{ "kind": "scene", "id": "scene-3", "title": "Checkpoint Lanterns" }]
        }
      ],
      "nextPlanningTargets": [
        {
          "title": "Define the chapter-level irreversible turn",
          "detail": "Clarify what Chapter 2 changes beyond surviving the checkpoint.",
          "focus": { "kind": "chapter", "id": "chapter-2", "title": "Chapter 2: Border Sparks" },
          "related": []
        }
      ]
    }
  }
}
"#;

        let (assistant_message, result) =
            parse_structured_action_response("story-diagnose-structure", raw);

        assert_eq!(assistant_message, "Reviewed the whole spine.");
        assert_eq!(
            result
                .story_structure_diagnostic
                .underdefined_chapters
                .len(),
            1
        );
        assert_eq!(
            result.story_structure_diagnostic.underdefined_chapters[0]
                .focus
                .as_ref()
                .map(|reference| reference.id.as_str()),
            Some("chapter-2")
        );
        assert_eq!(
            result.story_structure_diagnostic.missing_transitions.len(),
            1
        );
        assert_eq!(
            result
                .story_structure_diagnostic
                .brief_alignment_notes
                .len(),
            1
        );
        assert_eq!(
            result.story_structure_diagnostic.brief_alignment_notes[0].alignment,
            StoryBriefAlignment::Risk
        );
        assert_eq!(
            result
                .story_structure_diagnostic
                .ending_direction_preparation
                .len(),
            1
        );
        assert_eq!(
            result
                .story_structure_diagnostic
                .ending_direction_preparation[0]
                .focus
                .as_ref()
                .map(|reference| reference.id.as_str()),
            Some("chapter-2")
        );
        assert_eq!(
            result.story_structure_diagnostic.setup_payoff_support.len(),
            1
        );
        assert_eq!(
            result.story_structure_diagnostic.setup_payoff_support[0]
                .focus
                .as_ref()
                .map(|reference| reference.id.as_str()),
            Some("chapter-2")
        );
        assert_eq!(
            result
                .story_structure_diagnostic
                .next_planning_targets
                .len(),
            1
        );
    }

    #[test]
    fn structured_parser_normalizes_missing_or_invalid_story_brief_alignment_to_weak_support() {
        let raw = r#"
{
  "assistantMessage": "Reviewed the whole spine.",
  "result": {
    "summary": "Alignment values normalize safely.",
    "sceneProposals": [],
    "beatOutline": "",
    "manuscriptText": "",
    "storyStructureDiagnostic": {
      "underdefinedChapters": [],
      "redundantFunctions": [],
      "missingTransitions": [],
      "briefAlignmentNotes": [
        {
          "title": "Missing alignment should stay safe",
          "detail": "No explicit alignment label was returned.",
          "focus": { "kind": "chapter", "id": "chapter-1", "title": "Chapter 1: The Wrong Package" },
          "related": []
        },
        {
          "title": "Invalid alignment should stay safe",
          "detail": "Unexpected labels should not break the parser.",
          "alignment": "strongly_supports",
          "focus": { "kind": "chapter", "id": "chapter-2", "title": "Chapter 2: Border Sparks" },
          "related": []
        }
      ],
      "endingDirectionPreparation": [],
      "setupPayoffSupport": [],
      "nextPlanningTargets": []
    }
  }
}
"#;

        let (_, result) = parse_structured_action_response("story-diagnose-structure", raw);

        assert_eq!(
            result
                .story_structure_diagnostic
                .brief_alignment_notes
                .len(),
            2
        );
        assert_eq!(
            result.story_structure_diagnostic.brief_alignment_notes[0].alignment,
            StoryBriefAlignment::WeakSupport
        );
        assert_eq!(
            result.story_structure_diagnostic.brief_alignment_notes[1].alignment,
            StoryBriefAlignment::WeakSupport
        );
    }

    #[test]
    fn structured_parser_keeps_irrelevant_story_diagnostic_sections_empty_when_missing_or_blank() {
        let raw = r#"
{
  "assistantMessage": "Reviewed the whole spine.",
  "result": {
    "summary": "Optional sections can stay empty.",
    "sceneProposals": [],
    "beatOutline": "",
    "manuscriptText": "",
    "storyStructureDiagnostic": {
      "briefAlignmentNotes": [
        {
          "title": "",
          "detail": "Blank titles should be ignored.",
          "alignment": "risk"
        }
      ],
      "endingDirectionPreparation": [
        {}
      ],
      "setupPayoffSupport": [
        {
          "title": "  ",
          "detail": "Blank titles should be ignored here too."
        }
      ]
    }
  }
}
"#;

        let (_, result) = parse_structured_action_response("story-diagnose-structure", raw);

        assert!(result
            .story_structure_diagnostic
            .underdefined_chapters
            .is_empty());
        assert!(result
            .story_structure_diagnostic
            .redundant_functions
            .is_empty());
        assert!(result
            .story_structure_diagnostic
            .missing_transitions
            .is_empty());
        assert!(result
            .story_structure_diagnostic
            .brief_alignment_notes
            .is_empty());
        assert!(result
            .story_structure_diagnostic
            .ending_direction_preparation
            .is_empty());
        assert!(result
            .story_structure_diagnostic
            .setup_payoff_support
            .is_empty());
        assert!(result
            .story_structure_diagnostic
            .next_planning_targets
            .is_empty());
    }

    #[test]
    fn structured_parser_falls_back_to_plain_text_for_beats() {
        let (assistant_message, result) =
            parse_structured_action_response("scene-generate-beats", "Beat one\nBeat two");

        assert_eq!(assistant_message, "Beat one\nBeat two");
        assert_eq!(result.beat_outline, "Beat one\nBeat two");
        assert!(result.scene_proposals.is_empty());
        assert!(result
            .story_structure_diagnostic
            .underdefined_chapters
            .is_empty());
    }

    #[test]
    fn structured_story_diagnostic_prompt_calls_out_story_brief_alignment() {
        let snapshot = sample_project_snapshot();
        let prompt = build_structured_user_prompt(
            &snapshot,
            &sample_structured_input("story-diagnose-structure"),
        )
        .expect("story diagnostic prompt should build");

        assert!(prompt.contains("Saved story brief guidance:"));
        assert!(prompt.contains("Premise: A disgraced smuggler becomes guardian"));
        assert!(prompt.contains("Central conflict: Ava must keep the map alive"));
        assert!(prompt.contains("Evaluate structural concerns in light of the saved story brief"));
        assert!(prompt.contains("Do not force every brief field into the diagnosis."));
        assert!(prompt.contains(
            "use alignment support when the spine already gives clear concrete evidence"
        ));
        assert!(
            prompt.contains("If the saved brief is sparse, generic, or not materially relevant")
        );
        assert!(prompt.contains("result.storyStructureDiagnostic.endingDirectionPreparation"));
        assert!(prompt.contains("If the saved brief has no meaningful ending direction"));
        assert!(prompt.contains("result.storyStructureDiagnostic.setupPayoffSupport"));
        assert!(
            prompt.contains("If there is not enough evidence of a meaningful setup/payoff thread")
        );
    }

    #[test]
    fn structured_story_diagnostic_prompt_handles_sparse_brief_without_forcing_findings() {
        let mut snapshot = sample_project_snapshot();
        snapshot.project.logline.clear();
        snapshot.project.premise.clear();
        snapshot.project.central_conflict.clear();
        snapshot.project.thematic_intent.clear();
        snapshot.project.ending_direction.clear();
        snapshot.project.genre.clear();
        snapshot.project.tone.clear();

        let prompt = build_structured_user_prompt(
            &snapshot,
            &sample_structured_input("story-diagnose-structure"),
        )
        .expect("story diagnostic prompt should build for a sparse brief");

        assert!(prompt.contains("No additional saved story brief anchors are currently filled"));
        assert!(
            prompt.contains("If the saved brief is sparse, generic, or not materially relevant")
        );
        assert!(prompt.contains("If the saved brief has no meaningful ending direction"));
        assert!(
            prompt.contains("If there is not enough evidence of a meaningful setup/payoff thread")
        );
    }

    #[test]
    fn structured_scene_generation_prompts_focus_on_relevant_brief_fields() {
        let snapshot = sample_project_snapshot();

        let beats_prompt = build_structured_user_prompt(
            &snapshot,
            &sample_structured_input("scene-generate-beats"),
        )
        .expect("beat prompt should build");
        let draft_prompt =
            build_structured_user_prompt(&snapshot, &sample_structured_input("scene-expand-draft"))
                .expect("draft prompt should build");

        assert!(beats_prompt.contains("Saved story brief guidance:"));
        assert!(beats_prompt.contains("Thematic intent: Test whether responsibility"));
        assert!(beats_prompt.contains("Genre: Science-fantasy adventure"));
        assert!(beats_prompt.contains("Do not bolt theme or genre labels onto every beat."));
        assert!(!beats_prompt.contains("Audience notes"));

        assert!(draft_prompt.contains("Saved story brief guidance:"));
        assert!(draft_prompt.contains("Tone: Tense, intimate, and wonder-struck"));
        assert!(draft_prompt.contains("Let the saved story brief guide what the draft emphasizes"));
        assert!(draft_prompt.contains("Avoid heavy exposition about the brief."));
    }
}
