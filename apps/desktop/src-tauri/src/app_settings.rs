use std::collections::BTreeMap;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use anyhow::{Context, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::models::{
    AIProviderSettings, AIProviders, AISettings, AppSettings, SaveAIProviderSettingsInput,
    SaveAppSettingsInput,
};

const SETTINGS_FILE_NAME: &str = "app-settings.json";
const SECRETS_FILE_NAME: &str = "ai-secrets.json";
const KEYRING_SERVICE: &str = "NovelForge";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAIProviderSettings {
    enabled: bool,
    default_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAIProviders {
    gemini: StoredAIProviderSettings,
    groq: StoredAIProviderSettings,
    openrouter: StoredAIProviderSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAISettings {
    default_provider: String,
    providers: StoredAIProviders,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAppSettings {
    ai: StoredAISettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredSecrets {
    providers: BTreeMap<String, String>,
}

fn default_provider_settings(provider_id: &str) -> StoredAIProviderSettings {
    let default_model = match provider_id {
        "gemini" => "gemini-2.5-flash",
        "groq" => "llama-3.3-70b-versatile",
        "openrouter" => "openrouter/free",
        _ => "gemini-2.5-flash",
    };

    StoredAIProviderSettings {
        enabled: true,
        default_model: default_model.to_string(),
    }
}

fn default_stored_settings() -> StoredAppSettings {
    StoredAppSettings {
        ai: StoredAISettings {
            default_provider: "gemini".to_string(),
            providers: StoredAIProviders {
                gemini: default_provider_settings("gemini"),
                groq: default_provider_settings("groq"),
                openrouter: default_provider_settings("openrouter"),
            },
        },
    }
}

fn settings_dir(app: &AppHandle) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_config_dir()
        .context("Failed to resolve NovelForge app config directory.")?;
    fs::create_dir_all(&directory)
        .with_context(|| format!("Failed to create {}", directory.display()))?;
    Ok(directory)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(settings_dir(app)?.join(SETTINGS_FILE_NAME))
}

fn secrets_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(settings_dir(app)?.join(SECRETS_FILE_NAME))
}

fn keyring_entry(provider_id: &str) -> Result<Entry> {
    Entry::new(KEYRING_SERVICE, &format!("ai-provider-{provider_id}"))
        .context("Failed to create keyring entry.")
}

fn load_stored_settings(app: &AppHandle) -> Result<StoredAppSettings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(default_stored_settings());
    }

    let raw =
        fs::read_to_string(&path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&raw).context("Failed to parse app settings JSON.")
}

fn save_stored_settings(app: &AppHandle, settings: &StoredAppSettings) -> Result<()> {
    let path = settings_path(app)?;
    let raw =
        serde_json::to_string_pretty(settings).context("Failed to serialize app settings.")?;
    fs::write(&path, raw).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

fn load_fallback_secrets(app: &AppHandle) -> Result<StoredSecrets> {
    let path = secrets_path(app)?;
    if !path.exists() {
        return Ok(StoredSecrets::default());
    }

    let raw =
        fs::read_to_string(&path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&raw).context("Failed to parse AI secrets JSON.")
}

fn save_fallback_secrets(app: &AppHandle, secrets: &StoredSecrets) -> Result<()> {
    let path = secrets_path(app)?;
    let raw = serde_json::to_string_pretty(secrets).context("Failed to serialize AI secrets.")?;
    fs::write(&path, raw).with_context(|| format!("Failed to write {}", path.display()))?;
    #[cfg(unix)]
    {
        let permissions = fs::Permissions::from_mode(0o600);
        fs::set_permissions(&path, permissions)
            .with_context(|| format!("Failed to tighten permissions on {}", path.display()))?;
    }
    Ok(())
}

fn get_fallback_secret(app: &AppHandle, provider_id: &str) -> Result<Option<String>> {
    Ok(load_fallback_secrets(app)?
        .providers
        .get(provider_id)
        .cloned())
}

fn set_fallback_secret(app: &AppHandle, provider_id: &str, value: &str) -> Result<()> {
    let mut secrets = load_fallback_secrets(app)?;
    secrets
        .providers
        .insert(provider_id.to_string(), value.to_string());
    save_fallback_secrets(app, &secrets)
}

fn clear_fallback_secret(app: &AppHandle, provider_id: &str) -> Result<()> {
    let mut secrets = load_fallback_secrets(app)?;
    secrets.providers.remove(provider_id);
    save_fallback_secrets(app, &secrets)
}

fn read_secret(app: &AppHandle, provider_id: &str) -> Result<Option<String>> {
    if let Ok(entry) = keyring_entry(provider_id) {
        if let Ok(secret) = entry.get_password() {
            if !secret.trim().is_empty() {
                return Ok(Some(secret));
            }
        }
    }

    get_fallback_secret(app, provider_id)
}

fn write_secret(app: &AppHandle, provider_id: &str, value: &str) -> Result<()> {
    if let Ok(entry) = keyring_entry(provider_id) {
        if entry.set_password(value).is_ok() {
            let _ = clear_fallback_secret(app, provider_id);
            return Ok(());
        }
    }

    set_fallback_secret(app, provider_id, value)
}

fn clear_secret(app: &AppHandle, provider_id: &str) -> Result<()> {
    if let Ok(entry) = keyring_entry(provider_id) {
        let _ = entry.delete_credential();
    }
    clear_fallback_secret(app, provider_id)
}

fn hydrate_provider(
    app: &AppHandle,
    provider_id: &str,
    stored: &StoredAIProviderSettings,
) -> Result<AIProviderSettings> {
    Ok(AIProviderSettings {
        enabled: stored.enabled,
        has_api_key: read_secret(app, provider_id)?.is_some(),
        default_model: stored.default_model.clone(),
    })
}

fn to_app_settings(app: &AppHandle, stored: StoredAppSettings) -> Result<AppSettings> {
    Ok(AppSettings {
        ai: AISettings {
            default_provider: stored.ai.default_provider,
            providers: AIProviders {
                gemini: hydrate_provider(app, "gemini", &stored.ai.providers.gemini)?,
                groq: hydrate_provider(app, "groq", &stored.ai.providers.groq)?,
                openrouter: hydrate_provider(app, "openrouter", &stored.ai.providers.openrouter)?,
            },
        },
    })
}

fn sanitize_provider_input(
    provider_id: &str,
    input: &SaveAIProviderSettingsInput,
) -> StoredAIProviderSettings {
    StoredAIProviderSettings {
        enabled: input.enabled,
        default_model: if input.default_model.trim().is_empty() {
            default_provider_settings(provider_id).default_model
        } else {
            input.default_model.trim().to_string()
        },
    }
}

fn persist_provider_secret(
    app: &AppHandle,
    provider_id: &str,
    input: &SaveAIProviderSettingsInput,
) -> Result<()> {
    if input.clear_api_key {
        return clear_secret(app, provider_id);
    }

    if let Some(api_key) = &input.api_key {
        let trimmed = api_key.trim();
        if !trimmed.is_empty() {
            write_secret(app, provider_id, trimmed)?;
        }
    }

    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn default_app_settings() -> AppSettings {
    AppSettings {
        ai: AISettings {
            default_provider: "gemini".to_string(),
            providers: AIProviders {
                gemini: AIProviderSettings {
                    enabled: true,
                    has_api_key: false,
                    default_model: "gemini-2.5-flash".to_string(),
                },
                groq: AIProviderSettings {
                    enabled: true,
                    has_api_key: false,
                    default_model: "llama-3.3-70b-versatile".to_string(),
                },
                openrouter: AIProviderSettings {
                    enabled: true,
                    has_api_key: false,
                    default_model: "openrouter/free".to_string(),
                },
            },
        },
    }
}

pub fn get_app_settings(app: &AppHandle) -> Result<AppSettings> {
    let stored = load_stored_settings(app).unwrap_or_else(|_| default_stored_settings());
    to_app_settings(app, stored)
}

pub fn save_app_settings(app: &AppHandle, input: SaveAppSettingsInput) -> Result<AppSettings> {
    let stored = StoredAppSettings {
        ai: StoredAISettings {
            default_provider: input.ai.default_provider,
            providers: StoredAIProviders {
                gemini: sanitize_provider_input("gemini", &input.ai.providers.gemini),
                groq: sanitize_provider_input("groq", &input.ai.providers.groq),
                openrouter: sanitize_provider_input("openrouter", &input.ai.providers.openrouter),
            },
        },
    };

    save_stored_settings(app, &stored)?;
    persist_provider_secret(app, "gemini", &input.ai.providers.gemini)?;
    persist_provider_secret(app, "groq", &input.ai.providers.groq)?;
    persist_provider_secret(app, "openrouter", &input.ai.providers.openrouter)?;

    to_app_settings(app, stored)
}

pub fn get_provider_api_key(app: &AppHandle, provider_id: &str) -> Result<Option<String>> {
    read_secret(app, provider_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_choose_gemini_as_primary_provider() {
        let settings = default_app_settings();
        assert_eq!(settings.ai.default_provider, "gemini");
        assert_eq!(
            settings.ai.providers.gemini.default_model,
            "gemini-2.5-flash"
        );
    }

    #[test]
    fn provider_input_falls_back_to_known_default_model() {
        let input = SaveAIProviderSettingsInput {
            enabled: true,
            default_model: "   ".to_string(),
            api_key: None,
            clear_api_key: false,
        };

        let stored = sanitize_provider_input("openrouter", &input);
        assert_eq!(stored.default_model, "openrouter/free");
    }
}
