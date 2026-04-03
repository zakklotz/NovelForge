import { useEffect, useState } from "react";
import type {
  ScratchpadAction,
  ScratchpadMessage,
  ScratchpadResult,
} from "@novelforge/domain";
import { useNavigate } from "@tanstack/react-router";
import { Bot, MessageSquareText, SendHorizontal, User } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  SectionHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { useAiRuntime } from "@/hooks/useAiRuntime";
import { useAppSettings } from "@/hooks/useAppSettings";
import type { WorkbenchDocumentMeta } from "@/features/project/workbench";
import type { WorkbenchTab } from "@/store/uiStore";

interface ContextualAiSession {
  id: string;
  action: ScratchpadAction;
  draft: string;
  messages: ScratchpadMessage[];
  latestResult: ScratchpadResult | null;
  isRunning: boolean;
  error: string | null;
}

const actionLabels: Record<ScratchpadAction, string> = {
  "create-chapters": "Create chapters",
  "create-scenes": "Create scenes",
  "create-character-card": "Character card",
  summarize: "Summarize",
  "extract-continuity-notes": "Continuity notes",
};

function createContextualSession(tabId: string, action: ScratchpadAction): ContextualAiSession {
  return {
    id: `contextual-ai-${tabId}`,
    action,
    draft: "",
    messages: [],
    latestResult: null,
    isRunning: false,
    error: null,
  };
}

function getAvailableActions(tab: WorkbenchTab | null): ScratchpadAction[] {
  if (!tab) {
    return ["summarize"];
  }

  if (tab.kind === "chapter" || tab.kind === "chapters" || tab.kind === "scenes") {
    return ["create-scenes", "summarize", "extract-continuity-notes"];
  }

  if (tab.kind === "character" || tab.kind === "characters") {
    return ["create-character-card", "summarize", "extract-continuity-notes"];
  }

  if (tab.kind === "story") {
    return ["summarize", "create-chapters", "extract-continuity-notes"];
  }

  return ["summarize", "extract-continuity-notes"];
}

function MessageBubble({ message }: { message: ScratchpadMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={`rounded-[6px] border px-3 py-3 ${
        isAssistant
          ? "border-[var(--border)] bg-[var(--panel)]"
          : "border-[color:rgba(0,122,204,0.24)] bg-[var(--accent-soft)]"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {isAssistant ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
        {isAssistant ? "NovelForge AI" : "You"}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[var(--ink)]">
        {message.content}
      </p>
    </div>
  );
}

export function WorkbenchAiPanel({
  snapshotProjectId,
  activeTab,
  activeMeta,
}: {
  snapshotProjectId: string | null;
  activeTab: WorkbenchTab | null;
  activeMeta: WorkbenchDocumentMeta | null;
}) {
  const navigate = useNavigate();
  const appSettingsQuery = useAppSettings();
  const { runScratchpadChat } = useAiRuntime();
  const [sessions, setSessions] = useState<Record<string, ContextualAiSession>>({});

  const appSettings = appSettingsQuery.data;
  const activeSession = activeTab ? sessions[activeTab.id] ?? null : null;
  const availableActions = getAvailableActions(activeTab);
  const defaultProviderId = appSettings?.ai.defaultProvider ?? null;
  const defaultProvider = defaultProviderId ? appSettings?.ai.providers[defaultProviderId] : null;
  const hasConfiguredAi = Boolean(
    defaultProviderId &&
      defaultProvider?.hasApiKey &&
      defaultProvider.defaultModel.trim().length > 0,
  );

  useEffect(() => {
    if (!activeTab || !activeMeta) {
      return;
    }

    setSessions((current) =>
      current[activeTab.id]
        ? current
        : {
            ...current,
            [activeTab.id]: createContextualSession(activeTab.id, activeMeta.defaultAiAction),
          },
    );
  }, [activeMeta, activeTab]);

  function updateSession(partial: Partial<ContextualAiSession>) {
    if (!activeTab || !activeMeta) {
      return;
    }

    setSessions((current) => {
      const previous =
        current[activeTab.id] ??
        createContextualSession(activeTab.id, activeMeta.defaultAiAction);

      return {
        ...current,
        [activeTab.id]: {
          ...previous,
          ...partial,
        },
      };
    });
  }

  async function handleSend() {
    if (!snapshotProjectId || !activeTab || !activeMeta || !hasConfiguredAi || !defaultProviderId) {
      return;
    }

    const currentSession =
      activeSession ?? createContextualSession(activeTab.id, activeMeta.defaultAiAction);
    const modelId = defaultProvider?.defaultModel ?? "";
    const prompt = currentSession.draft.trim();

    if (!prompt || !modelId) {
      return;
    }

    const userMessage: ScratchpadMessage = {
      id: `contextual-ai-message-${crypto.randomUUID()}`,
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
      action: currentSession.action,
    };

    updateSession({
      draft: "",
      error: null,
      isRunning: true,
      messages: [...currentSession.messages, userMessage],
    });

    try {
      const response = await runScratchpadChat({
        projectId: snapshotProjectId,
        providerId: defaultProviderId,
        modelId,
        action: currentSession.action,
        sessionId: currentSession.id,
        sessionTitle: activeMeta.title,
        messages: currentSession.messages,
        userInput: prompt,
        projectContext: activeMeta.projectContext,
      });

      setSessions((current) => {
        const previous =
          current[activeTab.id] ??
          createContextualSession(activeTab.id, activeMeta.defaultAiAction);

        return {
          ...current,
          [activeTab.id]: {
            ...previous,
            isRunning: false,
            error: null,
            messages: [...previous.messages, response.assistantMessage],
            latestResult: response.result,
          },
        };
      });
    } catch (error) {
      updateSession({
        isRunning: false,
        error:
          error instanceof Error
            ? error.message
            : "NovelForge could not complete the contextual AI request.",
      });
    }
  }

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--content-bg)]">
      <div className="border-b border-[var(--border)] px-3.5 py-3.5">
        <SectionHeading
          title="Contextual AI"
          description="The assistant follows the active editor tab and scopes requests to that document."
          actions={
            <Button variant="secondary" onClick={() => void navigate({ to: "/scratchpad" })}>
              <MessageSquareText className="size-4" />
              Scratchpad
            </Button>
          }
        />

        {activeMeta ? (
          <div className="mt-3.5 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              Current Context
            </p>
            <div className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
              <p className="text-[12px] font-semibold text-[var(--ink)]">
                {activeMeta.aiContextPrefix}: {activeMeta.aiContextLabel}
              </p>
              {hasConfiguredAi && defaultProviderId ? (
                <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                  {defaultProviderId} / {defaultProvider?.defaultModel}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                  Configure a default provider in Settings to enable contextual chat.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {!activeTab || !activeMeta ? (
        <div className="p-4">
          <EmptyState
            title="No active document"
            description="AI works on the active tab. Open a scene, chapter, character, or story resource to start a contextual chat."
          />
        </div>
      ) : !hasConfiguredAi ? (
        <div className="p-4">
          <EmptyState
            title="AI needs a provider"
            description="Set a default AI provider and API key in Settings, then the right panel will chat about the active document automatically."
            action={
              <Button variant="secondary" onClick={() => void navigate({ to: "/settings" })}>
                Open Settings
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="border-b border-[var(--border)] px-3.5 py-3">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                Assist Mode
              </span>
              <Select
                value={activeSession?.action ?? activeMeta.defaultAiAction}
                onChange={(event) =>
                  updateSession({
                    action: event.target.value as ScratchpadAction,
                  })
                }
              >
                {availableActions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabels[action]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
            <div className="space-y-3">
              {(activeSession?.messages ?? []).length > 0 ? (
                (activeSession?.messages ?? []).map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <EmptyState
                  title="Context is ready"
                  description={`Start a prompt about ${activeMeta.aiContextLabel.toLowerCase()} and NovelForge will scope the request to the active tab.`}
                />
              )}

              {activeSession?.latestResult ? (
                <Panel className="bg-[var(--surface-elevated)] p-3">
                  <div className="flex flex-wrap gap-2">
                    {activeSession.latestResult.summary ? (
                      <Badge tone="accent">Summary ready</Badge>
                    ) : null}
                    {activeSession.latestResult.chapters.length > 0 ? (
                      <Badge>{activeSession.latestResult.chapters.length} chapters</Badge>
                    ) : null}
                    {activeSession.latestResult.scenes.length > 0 ? (
                      <Badge>{activeSession.latestResult.scenes.length} scenes</Badge>
                    ) : null}
                    {activeSession.latestResult.characters.length > 0 ? (
                      <Badge>{activeSession.latestResult.characters.length} characters</Badge>
                    ) : null}
                    {activeSession.latestResult.continuityNotes.length > 0 ? (
                      <Badge>{activeSession.latestResult.continuityNotes.length} notes</Badge>
                    ) : null}
                  </div>
                  {activeSession.latestResult.summary ? (
                    <p className="mt-3 text-[12px] leading-5 text-[var(--ink-muted)]">
                      {activeSession.latestResult.summary}
                    </p>
                  ) : null}
                </Panel>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-3.5 py-3.5">
            {activeSession?.error ? (
              <p className="mb-3 text-[12px] text-[var(--danger)]">{activeSession.error}</p>
            ) : null}
            <div className="grid gap-3">
              <Textarea
                placeholder={`Ask about ${activeMeta.aiContextLabel.toLowerCase()}...`}
                value={activeSession?.draft ?? ""}
                onChange={(event) => updateSession({ draft: event.target.value })}
              />
              <Button onClick={() => void handleSend()} disabled={Boolean(activeSession?.isRunning)}>
                <SendHorizontal className="size-4" />
                {activeSession?.isRunning ? "Thinking..." : "Send"}
              </Button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
