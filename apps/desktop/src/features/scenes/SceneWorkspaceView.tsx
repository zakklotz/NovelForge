import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlertTriangle,
  BookOpen,
  FileText,
  ListOrdered,
  Save,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { useUiStore } from "@/store/uiStore";
import { cn, splitCommaSeparated } from "@/lib/utils";
import type { ProjectSnapshot, Scene, Suggestion } from "@novelforge/domain";

type SceneWorkspaceTab = "overview" | "beats" | "draft";

interface ScenePlanningState {
  title: string;
  summary: string;
  purpose: string;
  beatOutline: string;
  conflict: string;
  outcome: string;
  location: string;
  timeLabel: string;
  povCharacterId: string;
  continuityTags: string;
  involvedCharacterIds: string[];
  dependencySceneIds: string[];
}

function emptyPlanningState(): ScenePlanningState {
  return {
    title: "",
    summary: "",
    purpose: "",
    beatOutline: "",
    conflict: "",
    outcome: "",
    location: "",
    timeLabel: "",
    povCharacterId: "",
    continuityTags: "",
    involvedCharacterIds: [],
    dependencySceneIds: [],
  };
}

function findRelatedSuggestions(sceneId: string, suggestions: Suggestion[]) {
  return suggestions.filter(
    (suggestion) =>
      suggestion.sourceObject.id === sceneId ||
      suggestion.impactedObject.id === sceneId ||
      suggestion.evidenceRefs.some((evidence) => evidence.id === sceneId),
  );
}

function buildStoryOrderedScenes(snapshot: ProjectSnapshot) {
  const chapterOrder = new Map(
    [...snapshot.chapters]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((chapter, index) => [chapter.id, index]),
  );

  return [...snapshot.scenes].sort((left, right) => {
    const leftChapterOrder =
      left.chapterId === null
        ? Number.MAX_SAFE_INTEGER
        : chapterOrder.get(left.chapterId) ?? Number.MAX_SAFE_INTEGER;
    const rightChapterOrder =
      right.chapterId === null
        ? Number.MAX_SAFE_INTEGER
        : chapterOrder.get(right.chapterId) ?? Number.MAX_SAFE_INTEGER;

    return (
      leftChapterOrder - rightChapterOrder ||
      left.orderIndex - right.orderIndex ||
      left.title.localeCompare(right.title)
    );
  });
}

function areListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function buildScenePlanningState(scene: Scene): ScenePlanningState {
  return {
    title: scene.title,
    summary: scene.summary,
    purpose: scene.purpose,
    beatOutline: scene.beatOutline,
    conflict: scene.conflict,
    outcome: scene.outcome,
    location: scene.location,
    timeLabel: scene.timeLabel,
    povCharacterId: scene.povCharacterId ?? "",
    continuityTags: scene.continuityTags.join(", "),
    involvedCharacterIds: [...scene.involvedCharacterIds],
    dependencySceneIds: [...scene.dependencySceneIds],
  };
}

function arePlanningStatesEqual(
  left: ScenePlanningState,
  right: ScenePlanningState,
) {
  return (
    left.title === right.title &&
    left.summary === right.summary &&
    left.purpose === right.purpose &&
    left.beatOutline === right.beatOutline &&
    left.conflict === right.conflict &&
    left.outcome === right.outcome &&
    left.location === right.location &&
    left.timeLabel === right.timeLabel &&
    left.povCharacterId === right.povCharacterId &&
    areListsEqual(splitCommaSeparated(left.continuityTags), splitCommaSeparated(right.continuityTags)) &&
    areListsEqual(left.involvedCharacterIds, right.involvedCharacterIds) &&
    areListsEqual(left.dependencySceneIds, right.dependencySceneIds)
  );
}

function getPlanningChangedFields(
  planning: ScenePlanningState,
  persistedPlanning: ScenePlanningState,
) {
  return [
    planning.title !== persistedPlanning.title ? "title" : null,
    planning.summary !== persistedPlanning.summary ? "summary" : null,
    planning.purpose !== persistedPlanning.purpose ? "purpose" : null,
    planning.beatOutline !== persistedPlanning.beatOutline ? "beatOutline" : null,
    planning.conflict !== persistedPlanning.conflict ? "conflict" : null,
    planning.outcome !== persistedPlanning.outcome ? "outcome" : null,
    planning.location !== persistedPlanning.location ? "location" : null,
    planning.timeLabel !== persistedPlanning.timeLabel ? "timeLabel" : null,
    (planning.povCharacterId || null) !== (persistedPlanning.povCharacterId || null)
      ? "povCharacterId"
      : null,
    !areListsEqual(
      splitCommaSeparated(planning.continuityTags),
      splitCommaSeparated(persistedPlanning.continuityTags),
    )
      ? "continuityTags"
      : null,
    !areListsEqual(
      planning.involvedCharacterIds,
      persistedPlanning.involvedCharacterIds,
    )
      ? "involvedCharacterIds"
      : null,
    !areListsEqual(
      planning.dependencySceneIds,
      persistedPlanning.dependencySceneIds,
    )
      ? "dependencySceneIds"
      : null,
  ].filter((value): value is string => Boolean(value));
}

function buildSceneSaveInput(
  scene: Scene,
  planning: ScenePlanningState,
  draft: string,
) {
  return {
    ...scene,
    title: planning.title,
    summary: planning.summary,
    purpose: planning.purpose,
    beatOutline: planning.beatOutline,
    conflict: planning.conflict,
    outcome: planning.outcome,
    location: planning.location,
    timeLabel: planning.timeLabel,
    povCharacterId: planning.povCharacterId || null,
    continuityTags: splitCommaSeparated(planning.continuityTags),
    involvedCharacterIds: planning.involvedCharacterIds,
    dependencySceneIds: planning.dependencySceneIds,
    manuscriptText: draft,
  };
}

export function SceneWorkspaceView() {
  const navigate = useNavigate();
  const { sceneId } = useParams({ from: "/scenes/$sceneId" });
  const snapshotQuery = useProjectSnapshot();
  const { saveScene, saveManuscript } = useProjectRuntime();
  const setWorkspaceSession = useUiStore((state) => state.setWorkspaceSession);
  const snapshot = snapshotQuery.data;

  const scene = snapshot?.scenes.find((item) => item.id === sceneId);
  const [workspaceTab, setWorkspaceTab] = useState<SceneWorkspaceTab>("overview");
  const [planning, setPlanning] = useState<ScenePlanningState>(() =>
    scene ? buildScenePlanningState(scene) : emptyPlanningState(),
  );
  const [persistedPlanning, setPersistedPlanning] = useState<ScenePlanningState>(() =>
    scene ? buildScenePlanningState(scene) : emptyPlanningState(),
  );
  const [draft, setDraft] = useState(scene?.manuscriptText ?? "<p></p>");
  const [persistedDraft, setPersistedDraft] = useState(
    scene?.manuscriptText ?? "<p></p>",
  );
  const [isDraftPersisting, setIsDraftPersisting] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const currentSceneRef = useRef(scene ?? null);
  const queuedDraftRef = useRef<string | null>(null);
  const activeDraftSavePromiseRef = useRef<Promise<void> | null>(null);
  const workspaceSavePromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    currentSceneRef.current = scene ?? null;
  }, [scene]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: scene?.manuscriptText ?? "<p></p>",
    onUpdate: ({ editor: currentEditor }) => {
      const nextDraft = currentEditor.getHTML();
      setDraft((currentDraft) =>
        currentDraft === nextDraft ? currentDraft : nextDraft,
      );
    },
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
    },
  });

  useEffect(() => {
    if (!scene) {
      return;
    }

    const nextPlanning = buildScenePlanningState(scene);
    queuedDraftRef.current = null;
    setWorkspaceTab("overview");
    setPlanning(nextPlanning);
    setPersistedPlanning(nextPlanning);
    setDraft(scene.manuscriptText);
    setPersistedDraft(scene.manuscriptText);
    setIsDraftPersisting(false);
    setIsSavingWorkspace(false);
  }, [scene?.id]);

  useEffect(() => {
    if (!editor || !scene) {
      return;
    }

    if (editor.getHTML() !== scene.manuscriptText) {
      editor.commands.setContent(scene.manuscriptText, false);
    }
  }, [editor, scene?.id]);

  useEffect(() => {
    if (!scene) {
      return;
    }

    const nextPlanning = buildScenePlanningState(scene);
    setPersistedPlanning((currentPlanning) =>
      arePlanningStatesEqual(currentPlanning, nextPlanning)
        ? currentPlanning
        : nextPlanning,
    );
    setPersistedDraft((currentDraft) =>
      currentDraft === scene.manuscriptText ? currentDraft : scene.manuscriptText,
    );
  }, [scene]);

  const planningChangedFields = scene
    ? getPlanningChangedFields(planning, persistedPlanning)
    : [];
  const planningDirty = planningChangedFields.length > 0;
  const draftDirty = Boolean(scene) && draft !== persistedDraft;
  const dirtyAreas = [
    planningDirty ? "planning" : null,
    draftDirty ? "draft" : null,
  ].filter((value): value is "planning" | "draft" => Boolean(value));

  function updatePlanningField<Key extends keyof ScenePlanningState>(
    key: Key,
    value: ScenePlanningState[Key],
  ) {
    setPlanning((currentPlanning) =>
      Object.is(currentPlanning[key], value)
        ? currentPlanning
        : {
            ...currentPlanning,
            [key]: value,
          },
    );
  }

  function drainDraftSaveQueue() {
    if (activeDraftSavePromiseRef.current) {
      return activeDraftSavePromiseRef.current;
    }

    const savePromise = (async () => {
      setIsDraftPersisting(true);

      try {
        while (queuedDraftRef.current !== null) {
          const manuscriptText = queuedDraftRef.current;
          queuedDraftRef.current = null;

          const currentScene = currentSceneRef.current;
          if (!currentScene) {
            return;
          }

          await saveManuscript({
            projectId: currentScene.projectId,
            sceneId: currentScene.id,
            manuscriptText,
          });
        }
      } finally {
        activeDraftSavePromiseRef.current = null;
        setIsDraftPersisting(false);
      }
    })();

    activeDraftSavePromiseRef.current = savePromise;
    return savePromise;
  }

  function queueDraftPersistence(manuscriptText: string) {
    queuedDraftRef.current = manuscriptText;
    void drainDraftSaveQueue().catch(() => undefined);
  }

  async function flushDraftPersistence(manuscriptText: string) {
    queuedDraftRef.current = manuscriptText;
    await drainDraftSaveQueue();
  }

  async function waitForDraftPersistenceToSettle() {
    if (!activeDraftSavePromiseRef.current) {
      return;
    }

    try {
      await activeDraftSavePromiseRef.current;
    } catch {
      // Keep local dirty state intact and let explicit save/discard decide next steps.
    }
  }

  useEffect(() => {
    if (!scene || !draftDirty) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      queueDraftPersistence(draft);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [draft, draftDirty, scene?.id]);

  async function saveCurrentWorkspaceChanges() {
    if (workspaceSavePromiseRef.current) {
      return workspaceSavePromiseRef.current;
    }

    const savePromise = (async () => {
      const currentScene = currentSceneRef.current;
      if (!currentScene) {
        return;
      }

      setIsSavingWorkspace(true);

      try {
        if (planningDirty) {
          await waitForDraftPersistenceToSettle();
          await saveScene(
            buildSceneSaveInput(currentScene, planning, draft),
            {
              id: crypto.randomUUID(),
              projectId: currentScene.projectId,
              occurredAt: new Date().toISOString(),
              type: "scene.updated",
              sceneId: currentScene.id,
              changedFields: planningChangedFields,
            },
          );
          return;
        }

        if (draftDirty) {
          await flushDraftPersistence(draft);
        }
      } finally {
        setIsSavingWorkspace(false);
      }
    })();

    workspaceSavePromiseRef.current = savePromise.finally(() => {
      workspaceSavePromiseRef.current = null;
    });

    return workspaceSavePromiseRef.current;
  }

  async function discardCurrentWorkspaceChanges() {
    const currentScene = currentSceneRef.current;
    if (!currentScene) {
      return;
    }

    const nextPlanning = persistedPlanning;
    const nextDraft = persistedDraft;
    const shouldRestorePersistedDraft = Boolean(activeDraftSavePromiseRef.current);

    queuedDraftRef.current = null;
    await waitForDraftPersistenceToSettle();

    if (shouldRestorePersistedDraft) {
      await saveManuscript({
        projectId: currentScene.projectId,
        sceneId: currentScene.id,
        manuscriptText: nextDraft,
      });
    }

    setPlanning(nextPlanning);
    setDraft(nextDraft);
    if (editor && editor.getHTML() !== nextDraft) {
      editor.commands.setContent(nextDraft, false);
    }
  }

  useLayoutEffect(() => {
    if (!scene) {
      setWorkspaceSession(null);
      return;
    }

    setWorkspaceSession({
      kind: "scene",
      entityId: scene.id,
      entityTitle: planning.title.trim() || scene.title,
      dirtyAreas,
      saveChanges: saveCurrentWorkspaceChanges,
      discardChanges: discardCurrentWorkspaceChanges,
    });
  }, [
    dirtyAreas,
    planning.title,
    scene,
    setWorkspaceSession,
  ]);

  useLayoutEffect(() => {
    if (!scene) {
      return;
    }

    const currentSceneId = scene.id;
    return () => {
      const session = useUiStore.getState().workspaceSession;
      if (session?.kind === "scene" && session.entityId === currentSceneId) {
        useUiStore.getState().setWorkspaceSession(null);
      }
    };
  }, [scene?.id]);

  if (!snapshot || !scene) {
    return (
      <Panel>
        <EmptyState
          title="Scene not found"
          description="The requested scene could not be found in the current project."
        />
      </Panel>
    );
  }

  const currentScene = scene;
  const chapter = snapshot.chapters.find((item) => item.id === currentScene.chapterId);
  const relatedCharacters = snapshot.characters.filter(
    (character) =>
      planning.involvedCharacterIds.includes(character.id) ||
      planning.povCharacterId === character.id,
  );
  const relatedSuggestions = findRelatedSuggestions(
    currentScene.id,
    snapshot.suggestions ?? [],
  );
  const chapterScenes = snapshot.scenes
    .filter((item) => item.chapterId === currentScene.chapterId)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const storyOrderedScenes = buildStoryOrderedScenes(snapshot);
  const chapterById = new Map(snapshot.chapters.map((item) => [item.id, item]));
  const scenePosition = chapterScenes.findIndex((item) => item.id === currentScene.id);
  const structuralPrompts = [
    planning.purpose
      ? `Scene purpose: ${planning.purpose}`
      : "Clarify why this scene belongs in the story at all.",
    planning.beatOutline.trim()
      ? "Check that each beat changes pressure, information, or emotional position."
      : "Sketch the scene in 3 to 5 beats before polishing the prose.",
    planning.outcome
      ? `Exit change: ${planning.outcome}`
      : "Decide what is different by the end of the scene.",
  ];
  const draftStatusLabel = draftDirty
    ? isDraftPersisting
      ? "Saving..."
      : "Saving soon..."
    : "Saved";

  async function handleSaveMetadata() {
    if (!planningDirty) {
      return;
    }

    await saveCurrentWorkspaceChanges();
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Scene Frame"
          description="Keep the scene's title, cast pressure, and continuity anchored while you plan and draft."
          actions={
            <Button
              onClick={() => void handleSaveMetadata()}
              disabled={!planningDirty || isSavingWorkspace}
            >
              <Save className="size-4" />
              {isSavingWorkspace
                ? "Saving..."
                : planningDirty
                  ? "Save Planning"
                  : "Planning Saved"}
            </Button>
          }
        />
        <p className="mt-4 text-sm text-[var(--ink-muted)]">
          {planningDirty
            ? "Planning changes are local until you save them."
            : "Planning fields are in sync with the project snapshot."}
        </p>
        <div className="mt-6 grid gap-4">
          <Field label="Title">
            <Input
              value={planning.title}
              onChange={(event) => updatePlanningField("title", event.target.value)}
            />
          </Field>
          <Field label="Story Slot">
            <Input
              readOnly
              value={
                chapter && scenePosition >= 0
                  ? `${chapter.title} · Scene ${scenePosition + 1} of ${chapterScenes.length}`
                  : "Unassigned scene"
              }
            />
          </Field>
          <Field label="POV Character">
            <Select
              value={planning.povCharacterId}
              onChange={(event) =>
                updatePlanningField("povCharacterId", event.target.value)
              }
            >
              <option value="">No POV selected</option>
              {snapshot.characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <Field label="Location">
              <Input
                value={planning.location}
                onChange={(event) =>
                  updatePlanningField("location", event.target.value)
                }
              />
            </Field>
            <Field label="Time">
              <Input
                value={planning.timeLabel}
                onChange={(event) =>
                  updatePlanningField("timeLabel", event.target.value)
                }
              />
            </Field>
          </div>
          <Field label="Continuity Tags" hint="Comma-separated">
            <Input
              value={planning.continuityTags}
              onChange={(event) =>
                updatePlanningField("continuityTags", event.target.value)
              }
            />
          </Field>
          <Field label="Involved Characters">
            <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
              {snapshot.characters.map((character) => (
                <label
                  key={character.id}
                  className="flex items-center gap-2 text-sm text-[var(--ink)]"
                >
                  <input
                    type="checkbox"
                    checked={planning.involvedCharacterIds.includes(character.id)}
                    onChange={(event) =>
                      setPlanning((currentPlanning) => ({
                        ...currentPlanning,
                        involvedCharacterIds: event.target.checked
                          ? [...currentPlanning.involvedCharacterIds, character.id]
                          : currentPlanning.involvedCharacterIds.filter(
                              (value) => value !== character.id,
                            ),
                      }))
                    }
                  />
                  {character.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Dependencies">
            <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
              {storyOrderedScenes
                .filter((candidate) => candidate.id !== currentScene.id)
                .map((candidate) => {
                  const candidateChapter = candidate.chapterId
                    ? chapterById.get(candidate.chapterId)
                    : null;

                  return (
                    <label
                      key={candidate.id}
                      className="grid gap-1 text-sm text-[var(--ink)]"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={planning.dependencySceneIds.includes(candidate.id)}
                          onChange={(event) =>
                            setPlanning((currentPlanning) => ({
                              ...currentPlanning,
                              dependencySceneIds: event.target.checked
                                ? [...currentPlanning.dependencySceneIds, candidate.id]
                                : currentPlanning.dependencySceneIds.filter(
                                    (value) => value !== candidate.id,
                                  ),
                            }))
                          }
                        />
                        {candidate.title}
                      </span>
                      <span className="pl-6 text-xs text-[var(--ink-faint)]">
                        {candidateChapter ? candidateChapter.title : "Unassigned"}
                      </span>
                    </label>
                  );
                })}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <SectionHeading
          title={planning.title || currentScene.title}
          description={
            chapter
              ? `${chapter.title} · ${planning.timeLabel || "Time not set"}`
              : "Unassigned chapter"
          }
        />
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl bg-white/60 p-1">
          {[
            { id: "overview", label: "Overview", icon: Target },
            { id: "beats", label: "Beats", icon: ListOrdered },
            { id: "draft", label: "Draft", icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = workspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-muted)] hover:bg-white",
                )}
                onClick={() => setWorkspaceTab(tab.id as SceneWorkspaceTab)}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {workspaceTab === "overview" ? (
          <div className="mt-6 grid gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
            <Field label="Summary" className="lg:col-span-2">
              <Textarea
                className="min-h-28"
                value={planning.summary}
                onChange={(event) => updatePlanningField("summary", event.target.value)}
                placeholder="What happens in this scene at a high level?"
              />
            </Field>
            <Field label="Purpose">
              <Textarea
                className="min-h-32"
                value={planning.purpose}
                onChange={(event) => updatePlanningField("purpose", event.target.value)}
                placeholder="Why does this scene exist in the story?"
              />
            </Field>
            <Field label="Outcome">
              <Textarea
                className="min-h-32"
                value={planning.outcome}
                onChange={(event) => updatePlanningField("outcome", event.target.value)}
                placeholder="What changes by the end of the scene?"
              />
            </Field>
            <Field label="Conflict" className="lg:col-span-2">
              <Textarea
                className="min-h-32"
                value={planning.conflict}
                onChange={(event) => updatePlanningField("conflict", event.target.value)}
                placeholder="What pressure, opposition, or contradiction drives the scene?"
              />
            </Field>
          </div>
        ) : null}

        {workspaceTab === "beats" ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
            <Field label="Beat Outline" hint="One beat per line">
              <Textarea
                className="min-h-[18rem] flex-1"
                value={planning.beatOutline}
                onChange={(event) =>
                  updatePlanningField("beatOutline", event.target.value)
                }
                placeholder={
                  "Opening image or status quo\nPressure enters\nTurn or reveal\nDecision\nExit state"
                }
              />
            </Field>
            <div className="grid gap-3 lg:grid-cols-3">
              {structuralPrompts.map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-2xl border border-black/8 bg-white/72 px-4 py-4 text-sm text-[var(--ink-muted)]"
                >
                  {prompt}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {workspaceTab === "draft" ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-4 text-sm text-[var(--ink-muted)]">
              <span>Draft prose stays separate from scene planning and autosaves after a pause.</span>
              <span>{draftStatusLabel}</span>
            </div>
            <div className="prose-editor mt-4 flex-1 rounded-[2rem] border border-black/8 bg-white/82 p-6 shadow-inner">
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Context"
          description="Keep chapter placement, nearby scenes, characters, and current analysis visible while you work."
        />

        <div className="mt-6 space-y-4">
          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <BookOpen className="size-4" />
              <h3 className="font-semibold">Parent Chapter</h3>
            </div>
            {chapter ? (
              <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
                <div>
                  <p className="font-semibold text-[var(--ink)]">{chapter.title}</p>
                  <p className="mt-1">{chapter.summary || "No chapter summary yet."}</p>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ink)]">Purpose:</span>{" "}
                  {chapter.purpose || "Not defined yet."}
                </div>
                <div>
                  <span className="font-semibold text-[var(--ink)]">Emotional movement:</span>{" "}
                  {chapter.emotionalMovement || "Not defined yet."}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No parent chapter"
                description="Assign this scene to a chapter to see its structural context here."
              />
            )}
          </Panel>

          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Sparkles className="size-4" />
              <h3 className="font-semibold">Nearby Scenes</h3>
            </div>
            {chapterScenes.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {chapterScenes.map((item, index) => (
                  <button
                    key={item.id}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-left transition",
                      item.id === currentScene.id
                        ? "border-[color:rgba(184,88,63,0.34)] bg-white"
                        : "border-black/8 bg-white/70 hover:bg-white",
                    )}
                    onClick={() =>
                      void navigate({
                        to: "/scenes/$sceneId",
                        params: { sceneId: item.id },
                      })
                    }
                  >
                    <div className="flex items-start gap-3">
                      <Badge tone={item.id === currentScene.id ? "accent" : "default"}>
                        {index + 1}
                      </Badge>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">
                          {item.summary || "No summary yet."}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No nearby scenes yet"
                description="Once this chapter has more scenes, they will appear here in story order."
              />
            )}
          </Panel>

          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Users className="size-4" />
              <h3 className="font-semibold">Relevant Characters</h3>
            </div>
            {relatedCharacters.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {relatedCharacters.map((character) => (
                  <div
                    key={character.id}
                    className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-[var(--ink)]">{character.name}</h4>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">
                          {character.role || "Role not defined yet."}
                        </p>
                      </div>
                      {planning.povCharacterId === character.id ? (
                        <Badge tone="accent">POV</Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)]">
                      <div>
                        <span className="font-semibold text-[var(--ink)]">Speaking style:</span>{" "}
                        {character.speakingStyle || "Not defined yet."}
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--ink)]">Arc direction:</span>{" "}
                        {character.arcDirection || "Not defined yet."}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No linked characters"
                description="Add involved characters or a POV character to keep their story pressure visible here."
              />
            )}
          </Panel>

          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <AlertTriangle className="size-4" />
              <h3 className="font-semibold">Suggestions + Analysis</h3>
            </div>
            {relatedSuggestions.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {relatedSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{suggestion.title}</p>
                        <p className="mt-2 text-sm text-[var(--ink-muted)]">
                          {suggestion.rationale}
                        </p>
                      </div>
                      <Badge
                        tone={
                          suggestion.severity === "high"
                            ? "danger"
                            : suggestion.severity === "medium"
                              ? "warning"
                              : "default"
                        }
                      >
                        {suggestion.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No scene-specific suggestions"
                description="Continuity and structure suggestions connected to this scene will appear here."
              />
            )}
          </Panel>
        </div>
      </Panel>
    </div>
  );
}
