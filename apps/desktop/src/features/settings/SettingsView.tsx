import { useEffect, useMemo, useState } from "react";
import type {
  AIProviderId,
  ProviderConnectionResult,
  SaveAppSettingsInput,
} from "@novelforge/domain";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, KeyRound, RefreshCw, Settings2, Shield, Sparkles } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Panel, SectionHeading, Select } from "@/components/ui";
import { useAiRuntime } from "@/hooks/useAiRuntime";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useRecommendedModels } from "@/hooks/useRecommendedModels";

const providerIds: AIProviderId[] = ["gemini", "groq", "openrouter"];

const providerMeta: Record<
  AIProviderId,
  { label: string; note: string; accent: string }
> = {
  gemini: {
    label: "Gemini",
    note: "Best default for long-context story planning and structured drafting help.",
    accent: "bg-[color:rgba(77,124,255,0.1)] text-[color:#3450c7]",
  },
  groq: {
    label: "Groq",
    note: "Great for very fast back-and-forth brainstorming and revision chat.",
    accent: "bg-[color:rgba(32,151,110,0.12)] text-[color:#0f7350]",
  },
  openrouter: {
    label: "OpenRouter",
    note: "Good fallback for rotating free open models and experimentation.",
    accent: "bg-[var(--warning-surface)] text-[var(--warning)]",
  },
};

type DraftProviderSettings = SaveAppSettingsInput["ai"]["providers"][AIProviderId];

type DraftState = SaveAppSettingsInput["ai"];

function buildDraftState(
  settings: ReturnType<typeof useAppSettings>["data"],
): DraftState | null {
  if (!settings) {
    return null;
  }

  return {
    defaultProvider: settings.ai.defaultProvider,
    providers: {
      gemini: {
        enabled: settings.ai.providers.gemini.enabled,
        defaultModel: settings.ai.providers.gemini.defaultModel,
        apiKey: "",
        clearApiKey: false,
      },
      groq: {
        enabled: settings.ai.providers.groq.enabled,
        defaultModel: settings.ai.providers.groq.defaultModel,
        apiKey: "",
        clearApiKey: false,
      },
      openrouter: {
        enabled: settings.ai.providers.openrouter.enabled,
        defaultModel: settings.ai.providers.openrouter.defaultModel,
        apiKey: "",
        clearApiKey: false,
      },
    },
  };
}

function mergeSavedSettingsIntoDraft(
  savedSettings: ReturnType<typeof useAppSettings>["data"],
  currentDraft: DraftState,
): DraftState {
  if (!savedSettings) {
    return currentDraft;
  }

  return {
    defaultProvider: savedSettings.ai.defaultProvider,
    providers: {
      gemini: {
        enabled: savedSettings.ai.providers.gemini.enabled,
        defaultModel: savedSettings.ai.providers.gemini.defaultModel,
        apiKey: currentDraft.providers.gemini.apiKey,
        clearApiKey: false,
      },
      groq: {
        enabled: savedSettings.ai.providers.groq.enabled,
        defaultModel: savedSettings.ai.providers.groq.defaultModel,
        apiKey: currentDraft.providers.groq.apiKey,
        clearApiKey: false,
      },
      openrouter: {
        enabled: savedSettings.ai.providers.openrouter.enabled,
        defaultModel: savedSettings.ai.providers.openrouter.defaultModel,
        apiKey: currentDraft.providers.openrouter.apiKey,
        clearApiKey: false,
      },
    },
  };
}

export function SettingsView({ standalone = false }: { standalone?: boolean }) {
  const appSettingsQuery = useAppSettings();
  const recommendedModelsQuery = useRecommendedModels();
  const { saveAppSettings, testProviderConnection } = useAiRuntime();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<AIProviderId | null>(null);
  const [testResults, setTestResults] = useState<
    Partial<Record<AIProviderId, ProviderConnectionResult>>
  >({});
  const [testErrors, setTestErrors] = useState<Partial<Record<AIProviderId, string>>>(
    {},
  );
  const [hasInitializedDraft, setHasInitializedDraft] = useState(false);

  useEffect(() => {
    if (appSettingsQuery.data && !hasInitializedDraft) {
      setDraft(buildDraftState(appSettingsQuery.data));
      setHasInitializedDraft(true);
    }
  }, [appSettingsQuery.data, hasInitializedDraft]);

  const recommendedModelsByProvider = useMemo(() => {
    const models = recommendedModelsQuery.data ?? [];
    return providerIds.reduce<Record<AIProviderId, typeof models>>((accumulator, providerId) => {
      accumulator[providerId] = models.filter((model) => model.providerId === providerId);
      return accumulator;
    }, {
      gemini: [],
      groq: [],
      openrouter: [],
    });
  }, [recommendedModelsQuery.data]);

  function updateProviderDraft(
    providerId: AIProviderId,
    updater: (current: DraftProviderSettings) => DraftProviderSettings,
  ) {
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        providers: {
          ...currentDraft.providers,
          [providerId]: updater(currentDraft.providers[providerId]),
        },
      };
    });
  }

  async function handleSave() {
    if (!draft) {
      return;
    }

    setSaveError(null);
    setSaveMessage(null);

    try {
      const savedSettings = await saveAppSettings({ ai: draft });
      setDraft((currentDraft) =>
        currentDraft ? mergeSavedSettingsIntoDraft(savedSettings, currentDraft) : buildDraftState(savedSettings),
      );
      setSaveMessage("AI settings saved locally for this desktop app.");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "NovelForge could not save the AI settings.",
      );
    }
  }

  async function handleTestProvider(providerId: AIProviderId) {
    if (!draft) {
      return;
    }

    setTestingProviderId(providerId);
    setTestErrors((current) => ({ ...current, [providerId]: undefined }));

    try {
      const result = await testProviderConnection({
        providerId,
        modelId: draft.providers[providerId].defaultModel,
        apiKeyOverride: draft.providers[providerId].apiKey || undefined,
      });
      setTestResults((current) => ({ ...current, [providerId]: result }));
    } catch (error) {
      setTestErrors((current) => ({
        ...current,
        [providerId]:
          error instanceof Error
            ? error.message
            : "NovelForge could not reach this provider.",
      }));
    } finally {
      setTestingProviderId(null);
    }
  }

  if (appSettingsQuery.isLoading || !draft) {
    return (
      <Panel className={standalone ? "mx-auto mt-16 max-w-5xl" : ""}>
        <EmptyState
          title="Loading AI settings"
          description="Preparing provider configuration and local credential state."
        />
      </Panel>
    );
  }

  const layoutClassName = standalone
    ? "mx-auto mt-10 max-w-6xl space-y-4 px-6 pb-10"
    : "h-full min-h-0 space-y-4 overflow-y-auto";

  return (
    <div className={layoutClassName}>
      <Panel className={standalone ? "bg-[var(--content-bg)]" : undefined}>
        <SectionHeading
          title="AI Settings"
          description="Bring your own keys for free-model providers and keep those credentials outside project files."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {standalone ? (
                <Link
                  to="/"
                  className="inline-flex items-center rounded-[4px] px-3 py-2 text-xs font-medium text-[var(--ink-muted)] transition hover:bg-[var(--hover)]"
                >
                  Back
                </Link>
              ) : null}
              <Button variant="secondary" onClick={handleSave}>
                <Shield className="size-4" />
                Save AI Settings
              </Button>
            </div>
          }
        />
        <div className="mt-5 grid gap-3 border-t border-[var(--border)] pt-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="grid gap-4">
            <Panel className="bg-[var(--surface-elevated)]">
              <Field label="Default Provider">
                <Select
                  value={draft.defaultProvider}
                  onChange={(event) =>
                    setDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            defaultProvider: event.target.value as AIProviderId,
                          }
                        : currentDraft,
                    )
                  }
                >
                  {providerIds.map((providerId) => (
                    <option key={providerId} value={providerId}>
                      {providerMeta[providerId].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="mt-4 flex flex-wrap gap-2">
                {providerIds.map((providerId) => (
                  <Badge
                    key={providerId}
                    className={providerMeta[providerId].accent}
                  >
                    {providerMeta[providerId].label}
                  </Badge>
                ))}
              </div>
              <p className="mt-4 text-sm text-[var(--ink-muted)]">
                Gemini is the recommended default for NovelForge because it handles
                large planning context well. Groq is the fast iteration option, and
                OpenRouter is the flexible fallback when you want to try free open
                models.
              </p>
            </Panel>

            {providerIds.map((providerId) => {
              const providerDraft = draft.providers[providerId];
              const providerSettings = appSettingsQuery.data?.ai.providers[providerId];
              const modelOptions = recommendedModelsByProvider[providerId];
              const hasUnsavedKey = Boolean(providerDraft.apiKey?.trim());
              const connectionResult = testResults[providerId];
              const connectionError = testErrors[providerId];

              return (
                <Panel key={providerId} className="bg-[var(--panel)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                          {providerMeta[providerId].label}
                        </h3>
                        <Badge className={providerMeta[providerId].accent}>
                          {providerId}
                        </Badge>
                        {providerSettings?.hasApiKey && !hasUnsavedKey ? (
                          <Badge tone="accent">Saved key</Badge>
                        ) : null}
                        {hasUnsavedKey ? <Badge tone="warning">Unsaved key</Badge> : null}
                      </div>
                      <p className="max-w-2xl text-sm text-[var(--ink-muted)]">
                        {providerMeta[providerId].note}
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--ink)]">
                      <input
                        type="checkbox"
                        checked={providerDraft.enabled}
                        onChange={(event) =>
                          updateProviderDraft(providerId, (current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                    <Field
                      label="API Key"
                      hint={
                        providerSettings?.hasApiKey && !hasUnsavedKey
                          ? "A key is already stored locally"
                          : "Stored outside project files"
                      }
                    >
                      <Input
                        type="password"
                        placeholder={
                          providerSettings?.hasApiKey && !hasUnsavedKey
                            ? "Saved locally. Enter a new key to replace it."
                            : "Paste provider API key"
                        }
                        value={providerDraft.apiKey ?? ""}
                        onChange={(event) =>
                          updateProviderDraft(providerId, (current) => ({
                            ...current,
                            apiKey: event.target.value,
                            clearApiKey: false,
                          }))
                        }
                      />
                    </Field>

                    <Field label="Default Model">
                      <div className="grid gap-2">
                        <Select
                          value={
                            modelOptions.some(
                              (model) => model.modelId === providerDraft.defaultModel,
                            )
                              ? providerDraft.defaultModel
                              : "__custom__"
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "__custom__") {
                              return;
                            }
                            updateProviderDraft(providerId, (current) => ({
                              ...current,
                              defaultModel: value,
                            }));
                          }}
                        >
                          {modelOptions.map((model) => (
                            <option key={model.modelId} value={model.modelId}>
                              {model.label}
                            </option>
                          ))}
                          <option value="__custom__">Custom model id</option>
                        </Select>
                        <Input
                          placeholder="Override with any provider model id"
                          value={providerDraft.defaultModel}
                          onChange={(event) =>
                            updateProviderDraft(providerId, (current) => ({
                              ...current,
                              defaultModel: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </Field>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        updateProviderDraft(providerId, (current) => ({
                          ...current,
                          apiKey: "",
                          clearApiKey: true,
                        }))
                      }
                    >
                      <KeyRound className="size-4" />
                      Clear Saved Key
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleTestProvider(providerId)}
                      disabled={!providerDraft.defaultModel.trim() || testingProviderId === providerId}
                    >
                      {testingProviderId === providerId ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Test Connection
                    </Button>
                  </div>

                  {connectionResult ? (
                    <div className="mt-4 rounded-[6px] border border-[color:rgba(137,209,133,0.22)] bg-[var(--success-surface)] px-4 py-3 text-sm text-[var(--success)]">
                      {connectionResult.message}
                    </div>
                  ) : null}

                  {connectionError ? (
                    <div className="mt-4 rounded-[6px] border border-[color:rgba(244,135,113,0.22)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]">
                      {connectionError}
                    </div>
                  ) : null}
                </Panel>
              );
            })}
          </div>

          <div className="grid gap-4">
            <Panel className="bg-[var(--sidebar-bg)] text-[var(--ink)] shadow-none">
              <div className="flex items-center gap-3">
                <Settings2 className="size-5 text-[var(--accent)]" />
                <div>
                  <h3 className="text-[14px] font-semibold">Storage Model</h3>
                  <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                    NovelForge stores AI preferences at the desktop-app level and
                    never writes provider keys into `.novelforge` project files.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel className="bg-[var(--surface-elevated)]">
              <div className="flex items-center gap-3">
                <Sparkles className="size-5 text-[var(--accent)]" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                    Free-model recommendations
                  </h3>
                  <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                    These are the first models wired into NovelForge for structured
                    story work.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {(recommendedModelsQuery.data ?? []).map((model) => (
                  <div
                    key={`${model.providerId}:${model.modelId}`}
                    className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={providerMeta[model.providerId].accent}>
                        {providerMeta[model.providerId].label}
                      </Badge>
                      <span className="text-sm font-semibold text-[var(--ink)]">
                        {model.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                      {model.description}
                    </p>
                    <p className="mt-2 font-mono text-xs text-[var(--ink-faint)]">
                      {model.modelId}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            {saveMessage ? (
              <Panel className="bg-[var(--success-surface)]">
                <p className="text-sm text-[var(--success)]">{saveMessage}</p>
              </Panel>
            ) : null}

            {saveError ? (
              <Panel className="bg-[var(--danger-surface)]">
                <p className="text-sm text-[var(--danger)]">{saveError}</p>
              </Panel>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}
