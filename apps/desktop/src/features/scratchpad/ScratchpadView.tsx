import { useEffect, useMemo, useState } from "react";
import type {
  AIProviderId,
  ScratchpadAction,
  ScratchpadMessage,
  ScratchpadProjectContext,
  ScratchpadResult,
  ScratchpadSession,
} from "@novelforge/domain";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  BookText,
  CheckSquare,
  RefreshCw,
  SendHorizontal,
  User,
  Users,
  WandSparkles,
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Panel, SectionHeading, Select, Textarea } from "@/components/ui";
import { useAiRuntime } from "@/hooks/useAiRuntime";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useRecommendedModels } from "@/hooks/useRecommendedModels";

const actionOptions: Array<{ id: ScratchpadAction; label: string; description: string }> = [
  {
    id: "create-chapters",
    label: "Create Chapters",
    description: "Turn rough notes or premise text into chapter-level structure.",
  },
  {
    id: "create-scenes",
    label: "Create Scenes",
    description: "Break pasted material into scene beats with metadata and rough prose.",
  },
  {
    id: "create-character-card",
    label: "Create Character Card",
    description: "Extract character-card fields from notes, excerpts, or outlines.",
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Compress pasted material into a usable structural summary.",
  },
  {
    id: "extract-continuity-notes",
    label: "Extract Continuity Notes",
    description: "Pull out reveal order, callback, and continuity concerns.",
  },
];

const providerLabels: Record<AIProviderId, string> = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
};

interface ResultSelection {
  chapters: number[];
  scenes: number[];
  characters: number[];
}

function createScratchpadSession(): ScratchpadSession {
  const timestamp = new Date().toISOString();
  return {
    id: `scratchpad-session-${crypto.randomUUID()}`,
    title: "Scratchpad Session",
    messages: [],
    latestResult: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildSelection(result: ScratchpadResult): ResultSelection {
  return {
    chapters: result.chapters.map((_, index) => index),
    scenes: result.scenes.map((_, index) => index),
    characters: result.characters.map((_, index) => index),
  };
}

function toggleIndex(values: number[], index: number) {
  return values.includes(index)
    ? values.filter((value) => value !== index)
    : [...values, index].sort((a, b) => a - b);
}

function buildSelectedResult(
  result: ScratchpadResult,
  selection: ResultSelection,
): ScratchpadResult {
  return {
    summary: result.summary,
    chapters: result.chapters.filter((_, index) => selection.chapters.includes(index)),
    scenes: result.scenes.filter((_, index) => selection.scenes.includes(index)),
    characters: result.characters.filter((_, index) =>
      selection.characters.includes(index),
    ),
    continuityNotes: result.continuityNotes,
  };
}

function countSelected(selection: ResultSelection) {
  return (
    selection.chapters.length + selection.scenes.length + selection.characters.length
  );
}

function MessageBubble({ message }: { message: ScratchpadMessage }) {
  const isAssistant = message.role === "assistant";
  return (
    <div
      className={`rounded-[1.75rem] px-4 py-4 ${
        isAssistant
          ? "bg-[color:rgba(255,248,239,0.95)] ring-1 ring-black/6"
          : "bg-[color:rgba(184,88,63,0.12)] text-[var(--ink)]"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {isAssistant ? <Bot className="size-4" /> : <User className="size-4" />}
        {isAssistant ? "NovelForge" : "You"}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
        {message.content}
      </p>
    </div>
  );
}

export function ScratchpadView() {
  const snapshotQuery = useProjectSnapshot();
  const appSettingsQuery = useAppSettings();
  const recommendedModelsQuery = useRecommendedModels();
  const { runScratchpadChat, applyScratchpadResult } = useAiRuntime();

  const [session, setSession] = useState<ScratchpadSession>(() => createScratchpadSession());
  const [action, setAction] = useState<ScratchpadAction>("create-scenes");
  const [providerId, setProviderId] = useState<AIProviderId>("gemini");
  const [modelId, setModelId] = useState("");
  const [hasInitializedProvider, setHasInitializedProvider] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [projectContext, setProjectContext] = useState<ScratchpadProjectContext>({
    chapterIds: [],
    sceneIds: [],
    characterIds: [],
  });
  const [selection, setSelection] = useState<ResultSelection>({
    chapters: [],
    scenes: [],
    characters: [],
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const snapshot = snapshotQuery.data;
  const appSettings = appSettingsQuery.data;
  const recommendedModels = recommendedModelsQuery.data ?? [];

  useEffect(() => {
    if (!appSettings || hasInitializedProvider) {
      return;
    }

    setProviderId(appSettings.ai.defaultProvider);
    setModelId(appSettings.ai.providers[appSettings.ai.defaultProvider].defaultModel);
    setHasInitializedProvider(true);
  }, [appSettings, hasInitializedProvider]);

  const providerModels = useMemo(
    () =>
      recommendedModels.filter((model) => model.providerId === providerId),
    [providerId, recommendedModels],
  );

  const selectedAction = actionOptions.find((option) => option.id === action);
  const latestResult = session.latestResult;
  const hasApiKey = appSettings?.ai.providers[providerId].hasApiKey ?? false;
  const isSelectionEmpty = latestResult ? countSelected(selection) === 0 : true;

  if (!snapshot) {
    return null;
  }

  const currentSnapshot = snapshot;

  async function handleSend() {
    if (!userInput.trim()) {
      return;
    }

    setIsRunning(true);
    setError(null);
    setApplyMessage(null);

    const userMessage: ScratchpadMessage = {
      id: `scratchpad-message-${crypto.randomUUID()}`,
      role: "user",
      content: userInput.trim(),
      createdAt: new Date().toISOString(),
      action,
    };

    try {
      const response = await runScratchpadChat({
        projectId: currentSnapshot.project.id,
        providerId,
        modelId: modelId.trim(),
        action,
        sessionId: session.id,
        sessionTitle: session.title,
        messages: session.messages,
        userInput: userMessage.content,
        projectContext,
      });

      const nextMessages = [...session.messages, userMessage, response.assistantMessage];
      setSession((currentSession) => ({
        ...currentSession,
        messages: nextMessages,
        latestResult: response.result,
        updatedAt: new Date().toISOString(),
      }));
      setSelection(buildSelection(response.result));
      setUserInput("");
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "NovelForge could not complete the scratchpad request.",
      );
      setSession((currentSession) => ({
        ...currentSession,
        messages: [...currentSession.messages, userMessage],
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleApply() {
    if (!latestResult || isSelectionEmpty) {
      return;
    }

    setIsApplying(true);
    setError(null);

    try {
      const selectedResult = buildSelectedResult(latestResult, selection);
      const output = await applyScratchpadResult({
        projectId: currentSnapshot.project.id,
        result: selectedResult,
      });
      setApplyMessage(
        `Applied ${output.applied.length} structured item${
          output.applied.length === 1 ? "" : "s"
        } to the current project.`,
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "NovelForge could not apply the scratchpad result.",
      );
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Scratchpad"
          description="Paste notes, outlines, excerpts, or manuscript fragments and turn them into reviewable story structure."
        />

        <div className="mt-6 grid gap-4">
          <Field label="Action">
            <Select
              value={action}
              onChange={(event) => setAction(event.target.value as ScratchpadAction)}
            >
              {actionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Panel className="bg-white/70">
            <div className="flex items-center gap-3">
              <WandSparkles className="size-5 text-[var(--accent-strong)]" />
              <div>
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  {selectedAction?.label}
                </h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {selectedAction?.description}
                </p>
              </div>
            </div>
          </Panel>

          <Field label="Provider">
            <Select
              value={providerId}
              onChange={(event) => {
                const nextProviderId = event.target.value as AIProviderId;
                setProviderId(nextProviderId);
                if (appSettings) {
                  setModelId(appSettings.ai.providers[nextProviderId].defaultModel);
                }
              }}
            >
              {(["gemini", "groq", "openrouter"] as AIProviderId[]).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {providerLabels[candidate]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Model">
            <div className="grid gap-2">
              <Select
                value={
                  providerModels.some((model) => model.modelId === modelId)
                    ? modelId
                    : "__custom__"
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__custom__") {
                    return;
                  }
                  setModelId(value);
                }}
              >
                {providerModels.map((model) => (
                  <option key={model.modelId} value={model.modelId}>
                    {model.label}
                  </option>
                ))}
                <option value="__custom__">Custom model id</option>
              </Select>
              <Input
                placeholder="Use any supported model id"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </div>
          </Field>

          {!hasApiKey ? (
            <Panel className="bg-[color:rgba(194,151,57,0.14)]">
              <p className="text-sm text-[var(--warning)]">
                Add a {providerLabels[providerId]} key in{" "}
                <Link to="/settings" className="font-semibold underline">
                  Settings
                </Link>{" "}
                before running scratchpad requests.
              </p>
            </Panel>
          ) : null}

          <Field label="Project Context" hint="Optional but useful for more grounded results">
            <div className="grid gap-3">
              <Panel className="bg-white/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <BookText className="size-4" />
                  Chapters
                </div>
                <div className="mt-3 grid gap-2">
                  {snapshot.chapters.map((chapter) => (
                    <label
                      key={chapter.id}
                      className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"
                    >
                      <input
                        type="checkbox"
                        checked={projectContext.chapterIds.includes(chapter.id)}
                        onChange={() =>
                          setProjectContext((current) => ({
                            ...current,
                            chapterIds: current.chapterIds.includes(chapter.id)
                              ? current.chapterIds.filter((id) => id !== chapter.id)
                              : [...current.chapterIds, chapter.id],
                          }))
                        }
                      />
                      {chapter.title}
                    </label>
                  ))}
                </div>
              </Panel>

              <Panel className="bg-white/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <ArrowRight className="size-4" />
                  Scenes
                </div>
                <div className="mt-3 grid gap-2">
                  {snapshot.scenes.map((scene) => (
                    <label
                      key={scene.id}
                      className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"
                    >
                      <input
                        type="checkbox"
                        checked={projectContext.sceneIds.includes(scene.id)}
                        onChange={() =>
                          setProjectContext((current) => ({
                            ...current,
                            sceneIds: current.sceneIds.includes(scene.id)
                              ? current.sceneIds.filter((id) => id !== scene.id)
                              : [...current.sceneIds, scene.id],
                          }))
                        }
                      />
                      {scene.title}
                    </label>
                  ))}
                </div>
              </Panel>

              <Panel className="bg-white/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <Users className="size-4" />
                  Characters
                </div>
                <div className="mt-3 grid gap-2">
                  {snapshot.characters.map((character) => (
                    <label
                      key={character.id}
                      className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"
                    >
                      <input
                        type="checkbox"
                        checked={projectContext.characterIds.includes(character.id)}
                        onChange={() =>
                          setProjectContext((current) => ({
                            ...current,
                            characterIds: current.characterIds.includes(character.id)
                              ? current.characterIds.filter((id) => id !== character.id)
                              : [...current.characterIds, character.id],
                          }))
                        }
                      />
                      {character.name}
                    </label>
                  ))}
                </div>
              </Panel>
            </div>
          </Field>

          <Field label="Paste or Prompt">
            <Textarea
              className="min-h-48"
              placeholder="Paste rough notes, an outline, a scene excerpt, or a manuscript chunk and tell NovelForge what you want built from it."
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
            />
          </Field>

          <Button
            onClick={handleSend}
            disabled={isRunning || !userInput.trim() || !hasApiKey || !modelId.trim()}
          >
            {isRunning ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
            Send to Scratchpad
          </Button>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <SectionHeading
          title="Chat Thread"
          description="Use this space like a story workshop. The assistant only proposes structure until you apply it."
        />

        <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto">
          {session.messages.length > 0 ? (
            session.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <EmptyState
              title="No scratchpad messages yet"
              description="Paste source material on the left and choose what the assistant should build from it."
            />
          )}
        </div>
      </Panel>

      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Structured Result"
          description="Review proposals before they become part of the current project."
          actions={
            <Button
              variant="secondary"
              onClick={handleApply}
              disabled={!latestResult || isSelectionEmpty || isApplying}
            >
              {isApplying ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <CheckSquare className="size-4" />
              )}
              Apply Selected
            </Button>
          }
        />

        {error ? (
          <Panel className="mt-4 bg-[color:rgba(174,67,45,0.1)]">
            <p className="text-sm text-[var(--danger)]">{error}</p>
          </Panel>
        ) : null}

        {applyMessage ? (
          <Panel className="mt-4 bg-[color:rgba(32,151,110,0.08)]">
            <p className="text-sm text-[color:#0f7350]">{applyMessage}</p>
          </Panel>
        ) : null}

        {latestResult ? (
          <div className="mt-6 space-y-4">
            <Panel className="bg-white/75">
              <h3 className="text-base font-semibold text-[var(--ink)]">Summary</h3>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                {latestResult.summary || "The assistant returned structure without a summary."}
              </p>
            </Panel>

            <Panel className="bg-white/75">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[var(--ink)]">Chapters</h3>
                <Badge tone="accent">{latestResult.chapters.length}</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {latestResult.chapters.length > 0 ? (
                  latestResult.chapters.map((chapter, index) => (
                    <label
                      key={`${chapter.title}-${index}`}
                      className="grid gap-2 rounded-2xl bg-white px-4 py-4 ring-1 ring-black/6"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selection.chapters.includes(index)}
                          onChange={() =>
                            setSelection((current) => ({
                              ...current,
                              chapters: toggleIndex(current.chapters, index),
                            }))
                          }
                        />
                        <span className="font-semibold text-[var(--ink)]">
                          {chapter.title}
                        </span>
                      </span>
                      <p className="text-sm text-[var(--ink-muted)]">{chapter.summary}</p>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-[var(--ink-muted)]">
                    No chapter proposals in this response.
                  </p>
                )}
              </div>
            </Panel>

            <Panel className="bg-white/75">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[var(--ink)]">Scenes</h3>
                <Badge tone="accent">{latestResult.scenes.length}</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {latestResult.scenes.length > 0 ? (
                  latestResult.scenes.map((scene, index) => (
                    <label
                      key={`${scene.title}-${index}`}
                      className="grid gap-2 rounded-2xl bg-white px-4 py-4 ring-1 ring-black/6"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selection.scenes.includes(index)}
                          onChange={() =>
                            setSelection((current) => ({
                              ...current,
                              scenes: toggleIndex(current.scenes, index),
                            }))
                          }
                        />
                        <span className="font-semibold text-[var(--ink)]">
                          {scene.title}
                        </span>
                      </span>
                      <p className="text-sm text-[var(--ink-muted)]">{scene.summary}</p>
                      {scene.chapterTitleHint ? (
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                          Suggested chapter: {scene.chapterTitleHint}
                        </p>
                      ) : null}
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-[var(--ink-muted)]">
                    No scene proposals in this response.
                  </p>
                )}
              </div>
            </Panel>

            <Panel className="bg-white/75">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[var(--ink)]">Characters</h3>
                <Badge tone="accent">{latestResult.characters.length}</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {latestResult.characters.length > 0 ? (
                  latestResult.characters.map((character, index) => (
                    <label
                      key={`${character.name}-${index}`}
                      className="grid gap-2 rounded-2xl bg-white px-4 py-4 ring-1 ring-black/6"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selection.characters.includes(index)}
                          onChange={() =>
                            setSelection((current) => ({
                              ...current,
                              characters: toggleIndex(current.characters, index),
                            }))
                          }
                        />
                        <span className="font-semibold text-[var(--ink)]">
                          {character.name}
                        </span>
                      </span>
                      <p className="text-sm text-[var(--ink-muted)]">{character.role}</p>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-[var(--ink-muted)]">
                    No character proposals in this response.
                  </p>
                )}
              </div>
            </Panel>

            <Panel className="bg-white/75">
              <h3 className="text-base font-semibold text-[var(--ink)]">
                Continuity Notes
              </h3>
              <ul className="mt-3 grid gap-2">
                {latestResult.continuityNotes.length > 0 ? (
                  latestResult.continuityNotes.map((note) => (
                    <li
                      key={note}
                      className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--ink-muted)] ring-1 ring-black/6"
                    >
                      {note}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-[var(--ink-muted)]">
                    No continuity notes in this response.
                  </li>
                )}
              </ul>
            </Panel>
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="No result yet"
              description="After you send material through the scratchpad, NovelForge will show structured proposals here for review."
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
