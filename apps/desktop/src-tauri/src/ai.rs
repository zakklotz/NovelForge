use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::app_settings::get_provider_api_key;
use crate::models::{
    Chapter, ChapterProposal, Character, CharacterProposal, ProjectSnapshot, RecommendedModel,
    Relationship, RunScratchpadChatInput, Scene, SceneProposal, ScratchpadChatResponse,
    ScratchpadMessage, ScratchpadProjectContext, ScratchpadResult, TestProviderConnectionInput,
    ProviderConnectionResult,
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
        .ok_or_else(|| anyhow!("Add an API key for {provider_id} in Settings before using this provider."))
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

fn selected_chapters(snapshot: &ProjectSnapshot, context: &ScratchpadProjectContext) -> Vec<Chapter> {
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

fn build_context_blob(snapshot: &ProjectSnapshot, context: &ScratchpadProjectContext) -> String {
    serde_json::to_string_pretty(&json!({
        "project": {
            "id": snapshot.project.id,
            "title": snapshot.project.title,
            "logline": snapshot.project.logline,
        },
        "selectedChapters": selected_chapters(snapshot, context),
        "selectedScenes": selected_scenes(snapshot, context),
        "selectedCharacters": selected_characters(snapshot, context),
    }))
    .unwrap_or_else(|_| "{}".to_string())
}

fn action_brief(action: &str) -> &'static str {
    match action {
        "create-chapters" => {
            "Create or refine chapter-level structure from the pasted material."
        }
        "create-scenes" => {
            "Break the pasted material into scene-level units with usable metadata."
        }
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
        scenes: raw
            .scenes
            .into_iter()
            .filter(|scene| !scene.title.trim().is_empty())
            .map(|scene| SceneProposal {
                target_scene_id: scene.target_scene_id,
                chapter_id: scene.chapter_id,
                chapter_title_hint: scene.chapter_title_hint,
                title: scene.title,
                summary: scene.summary,
                purpose: scene.purpose,
                conflict: scene.conflict,
                outcome: scene.outcome,
                pov_character_id: scene.pov_character_id,
                location: scene.location,
                time_label: scene.time_label,
                involved_character_ids: scene.involved_character_ids,
                continuity_tags: scene.continuity_tags,
                dependency_scene_ids: scene.dependency_scene_ids,
                manuscript_text: if scene.manuscript_text.trim().is_empty() {
                    "<p></p>".to_string()
                } else {
                    scene.manuscript_text
                },
            })
            .collect(),
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
                &[("HTTP-Referer", "https://novelforge.local"), ("X-Title", "NovelForge")],
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
        message: format!("Provider responded successfully: {}", truncate_text(&response, 120)),
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
