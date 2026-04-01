import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  FileText,
  ListOrdered,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Users,
  WandSparkles,
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
import { useAiRuntime } from "@/hooks/useAiRuntime";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { useUiStore } from "@/store/uiStore";
import { cn, splitCommaSeparated, splitLines } from "@/lib/utils";
import type {
  ProjectSnapshot,
  Scene,
  StructuredAiResponse,
  Suggestion,
} from "@novelforge/domain";

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

function buildSceneWorkspaceAiContext(
  scene: Scene,
  planning: ScenePlanningState,
  draft: string,
  chapter: { id: string; title: string; summary: string; purpose: string } | null,
  chapterScenes: Array<{
    id: string;
    orderIndex: number;
    title: string;
    summary: string;
    outcome: string;
  }>,
  relatedCharacters: Array<{ id: string; name: string; role: string }>,
) {
  return JSON.stringify(
    {
      scenePlanningDraft: {
        id: scene.id,
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
      },
      parentChapter: chapter,
      nearbyScenes: chapterScenes.map((candidate) => ({
        id: candidate.id,
        orderIndex: candidate.orderIndex,
        title: candidate.title,
        summary: candidate.summary,
        outcome: candidate.outcome,
      })),
      relatedCharacters,
      currentDraft: draft,
    },
    null,
    2,
  );
}

function getHtmlTextContent(value: string) {
  if (typeof DOMParser === "undefined") {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return new DOMParser()
    .parseFromString(value, "text/html")
    .body.textContent?.replace(/\s+/g, " ")
    .trim() ?? "";
}

function isBlankHtml(value: string) {
  return getHtmlTextContent(value).length === 0;
}

function countWords(value: string) {
  return value.trim().length > 0 ? value.trim().split(/\s+/).length : 0;
}

function appendBeatOutline(current: string, incoming: string) {
  const currentOutline = current.trim();
  const incomingOutline = incoming.trim();

  if (!currentOutline) {
    return incomingOutline;
  }

  if (!incomingOutline) {
    return currentOutline;
  }

  return `${currentOutline}\n${incomingOutline}`;
}

function appendDraftHtml(current: string, incoming: string) {
  const currentHtml = current.trim() || "<p></p>";
  const incomingHtml = incoming.trim() || "<p></p>";

  if (isBlankHtml(currentHtml)) {
    return incomingHtml;
  }

  if (isBlankHtml(incomingHtml)) {
    return currentHtml;
  }

  return `${currentHtml}<p></p>${incomingHtml}`;
}

interface DraftReviewBlock {
  html: string;
  text: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSelectedBeatOutline(lines: string[], selectedIndexes: number[]) {
  const selectedIndexSet = new Set(selectedIndexes);

  return lines
    .filter((_, index) => selectedIndexSet.has(index))
    .join("\n")
    .trim();
}

function getDraftReviewBlocks(value: string): DraftReviewBlock[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  if (typeof DOMParser === "undefined") {
    const text = getHtmlTextContent(normalized);
    return text ? [{ html: normalized, text }] : [];
  }

  const body = new DOMParser().parseFromString(normalized, "text/html").body;
  const blocks = Array.from(body.childNodes)
    .map((node) => {
      if (node.nodeType === 3) {
        const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return text
          ? {
              html: `<p>${escapeHtml(text)}</p>`,
              text,
            }
          : null;
      }

      if (node.nodeType !== 1) {
        return null;
      }

      const element = node as HTMLElement;
      const html = element.outerHTML;
      const text = getHtmlTextContent(html);

      return text ? { html, text } : null;
    })
    .filter((block): block is DraftReviewBlock => Boolean(block));

  if (blocks.length > 0) {
    return blocks;
  }

  const text = getHtmlTextContent(normalized);
  return text ? [{ html: normalized, text }] : [];
}

function buildSelectedDraftHtml(
  blocks: DraftReviewBlock[],
  selectedIndexes: number[],
) {
  const selectedIndexSet = new Set(selectedIndexes);

  return blocks
    .filter((_, index) => selectedIndexSet.has(index))
    .map((block) => block.html)
    .join("");
}

export function SceneWorkspaceView() {
  const navigate = useNavigate();
  const { sceneId } = useParams({ from: "/scenes/$sceneId" });
  const snapshotQuery = useProjectSnapshot();
  const appSettingsQuery = useAppSettings();
  const { runStructuredAiAction } = useAiRuntime();
  const { saveScene, saveManuscript } = useProjectRuntime();
  const setWorkspaceSession = useUiStore((state) => state.setWorkspaceSession);
  const diagnosticJumpHighlight = useUiStore((state) => state.diagnosticJumpHighlight);
  const setDiagnosticJumpHighlight = useUiStore(
    (state) => state.setDiagnosticJumpHighlight,
  );
  const snapshot = snapshotQuery.data;
  const appSettings = appSettingsQuery.data;

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
  const [beatReview, setBeatReview] = useState<StructuredAiResponse | null>(null);
  const [draftReview, setDraftReview] = useState<StructuredAiResponse | null>(null);
  const [selectedBeatIndexes, setSelectedBeatIndexes] = useState<number[]>([]);
  const [selectedDraftBlockIndexes, setSelectedDraftBlockIndexes] = useState<
    number[]
  >([]);
  const [sceneAiError, setSceneAiError] = useState<string | null>(null);
  const [isGeneratingBeats, setIsGeneratingBeats] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const currentSceneRef = useRef(scene ?? null);
  const queuedDraftRef = useRef<string | null>(null);
  const activeDraftSavePromiseRef = useRef<Promise<void> | null>(null);
  const workspaceSavePromiseRef = useRef<Promise<void> | null>(null);
  const sceneJumpHighlightRef = useRef<HTMLElement | null>(null);
  const [isJumpHighlighted, setIsJumpHighlighted] = useState(false);

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
    setBeatReview(null);
    setDraftReview(null);
    setSelectedBeatIndexes([]);
    setSelectedDraftBlockIndexes([]);
    setSceneAiError(null);
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

  useEffect(() => {
    if (!scene || diagnosticJumpHighlight?.kind !== "scene") {
      return;
    }

    if (diagnosticJumpHighlight.id !== scene.id) {
      return;
    }

    setIsJumpHighlighted(true);
    setDiagnosticJumpHighlight(null);

    const highlightNode = sceneJumpHighlightRef.current;
    if (highlightNode) {
      if (typeof highlightNode.scrollIntoView === "function") {
        highlightNode.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      highlightNode.focus({ preventScroll: true });
    }

    const timeoutId = window.setTimeout(() => {
      setIsJumpHighlighted(false);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [diagnosticJumpHighlight, scene, setDiagnosticJumpHighlight]);

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
  const defaultProviderId = appSettings?.ai.defaultProvider;
  const defaultModelId = defaultProviderId
    ? appSettings.ai.providers[defaultProviderId].defaultModel
    : "";
  const hasConfiguredAi = defaultProviderId
    ? appSettings?.ai.providers[defaultProviderId].hasApiKey &&
      defaultModelId.trim().length > 0
    : false;
  const currentBeatLines = splitLines(planning.beatOutline);
  const proposedBeatLines = splitLines(beatReview?.result.beatOutline ?? "");
  const selectedBeatOutline = buildSelectedBeatOutline(
    proposedBeatLines,
    selectedBeatIndexes,
  );
  const selectedBeatCount = splitLines(selectedBeatOutline).length;
  const proposedDraftBlocks = getDraftReviewBlocks(
    draftReview?.result.manuscriptText ?? "",
  );
  const selectedDraftHtml = buildSelectedDraftHtml(
    proposedDraftBlocks,
    selectedDraftBlockIndexes,
  );
  const selectedDraftBlockCount = getDraftReviewBlocks(selectedDraftHtml).length;
  const currentDraftText = getHtmlTextContent(draft);
  const selectedDraftText = getHtmlTextContent(selectedDraftHtml);
  const currentDraftWordCount = countWords(currentDraftText);
  const selectedDraftWordCount = countWords(selectedDraftText);
  const canAppendBeats =
    Boolean(selectedBeatOutline) &&
    planning.beatOutline.trim().length > 0;
  const canAppendDraft =
    !isBlankHtml(selectedDraftHtml) && !isBlankHtml(draft);

  async function handleSaveMetadata() {
    if (!planningDirty) {
      return;
    }

    await saveCurrentWorkspaceChanges();
  }

  async function handleGenerateBeats() {
    if (!defaultProviderId || !defaultModelId.trim()) {
      return;
    }

    setIsGeneratingBeats(true);
    setSceneAiError(null);
    setBeatReview(null);
    setSelectedBeatIndexes([]);

    try {
      const response = await runStructuredAiAction({
        projectId: currentScene.projectId,
        providerId: defaultProviderId,
        modelId: defaultModelId.trim(),
        action: "scene-generate-beats",
        sceneId: currentScene.id,
        workspaceContext: buildSceneWorkspaceAiContext(
          currentScene,
          planning,
          draft,
          chapter
            ? {
                id: chapter.id,
                title: chapter.title,
                summary: chapter.summary,
                purpose: chapter.purpose,
              }
            : null,
          chapterScenes,
          relatedCharacters.map((character) => ({
            id: character.id,
            name: character.name,
            role: character.role,
          })),
        ),
      });

      setBeatReview(response);
      setSelectedBeatIndexes(
        splitLines(response.result.beatOutline).map((_, index) => index),
      );
      setWorkspaceTab("beats");
    } catch (error) {
      setSceneAiError(
        error instanceof Error
          ? error.message
          : "NovelForge could not generate beats for this scene.",
      );
    } finally {
      setIsGeneratingBeats(false);
    }
  }

  function handleCancelBeatReview() {
    setBeatReview(null);
    setSelectedBeatIndexes([]);
  }

  function handleApplyBeatOutline(mode: "replace" | "append" = "replace") {
    const nextBeatOutline = selectedBeatOutline;
    if (!nextBeatOutline) {
      return;
    }

    updatePlanningField(
      "beatOutline",
      mode === "append"
        ? appendBeatOutline(planning.beatOutline, nextBeatOutline)
        : nextBeatOutline,
    );
    setBeatReview(null);
    setSelectedBeatIndexes([]);
    setWorkspaceTab("beats");
  }

  async function handleExpandDraft() {
    if (!defaultProviderId || !defaultModelId.trim() || !planning.beatOutline.trim()) {
      return;
    }

    setIsGeneratingDraft(true);
    setSceneAiError(null);
    setDraftReview(null);
    setSelectedDraftBlockIndexes([]);

    try {
      const response = await runStructuredAiAction({
        projectId: currentScene.projectId,
        providerId: defaultProviderId,
        modelId: defaultModelId.trim(),
        action: "scene-expand-draft",
        sceneId: currentScene.id,
        workspaceContext: buildSceneWorkspaceAiContext(
          currentScene,
          planning,
          draft,
          chapter
            ? {
                id: chapter.id,
                title: chapter.title,
                summary: chapter.summary,
                purpose: chapter.purpose,
              }
            : null,
          chapterScenes,
          relatedCharacters.map((character) => ({
            id: character.id,
            name: character.name,
            role: character.role,
          })),
        ),
      });

      setDraftReview(response);
      setSelectedDraftBlockIndexes(
        getDraftReviewBlocks(response.result.manuscriptText).map((_, index) => index),
      );
      setWorkspaceTab("draft");
    } catch (error) {
      setSceneAiError(
        error instanceof Error
          ? error.message
          : "NovelForge could not expand the scene into rough draft prose.",
      );
    } finally {
      setIsGeneratingDraft(false);
    }
  }

  function handleCancelDraftReview() {
    setDraftReview(null);
    setSelectedDraftBlockIndexes([]);
  }

  function handleApplyDraft(mode: "replace" | "append" = "replace") {
    const generatedDraft = selectedDraftHtml || "<p></p>";
    const nextDraft =
      mode === "append" ? appendDraftHtml(draft, generatedDraft) : generatedDraft;
    setDraft(nextDraft);
    if (editor && editor.getHTML() !== nextDraft) {
      editor.commands.setContent(nextDraft, false);
    }
    setDraftReview(null);
    setSelectedDraftBlockIndexes([]);
    setWorkspaceTab("draft");
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <Panel
        ref={sceneJumpHighlightRef}
        tabIndex={-1}
        data-jump-highlighted={isJumpHighlighted ? "true" : undefined}
        className={cn(
          "min-h-0 overflow-y-auto outline-none transition",
          isJumpHighlighted
            ? "ring-2 ring-[color:rgba(184,88,63,0.28)] shadow-[0_0_0_4px_rgba(184,88,63,0.10)]"
            : null,
        )}
      >
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
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void handleGenerateBeats()}
                disabled={!hasConfiguredAi || isGeneratingBeats}
              >
                {isGeneratingBeats ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                Generate Beats
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleExpandDraft()}
                disabled={!hasConfiguredAi || !planning.beatOutline.trim() || isGeneratingDraft}
              >
                {isGeneratingDraft ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Expand to Draft
              </Button>
            </div>
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

        {!hasConfiguredAi ? (
          <Panel className="mt-4 bg-[color:rgba(194,151,57,0.12)] shadow-none">
            <p className="text-sm text-[var(--warning)]">
              Add a default AI provider and API key in Settings to generate beats or
              rough draft prose from this scene workspace.
            </p>
          </Panel>
        ) : null}

        {sceneAiError ? (
          <Panel className="mt-4 bg-[color:rgba(174,67,45,0.1)] shadow-none">
            <p className="text-sm text-[var(--danger)]">{sceneAiError}</p>
          </Panel>
        ) : null}

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

            {beatReview ? (
              <Panel className="bg-white/75 shadow-none">
                <SectionHeading
                  title="Generated Beat Outline"
                  description={
                    beatReview.result.summary ||
                    beatReview.assistantMessage ||
                    "Review the generated beat outline against the current one before applying it."
                  }
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={handleCancelBeatReview}>
                        Cancel
                      </Button>
                      {canAppendBeats ? (
                        <Button
                          variant="secondary"
                          onClick={() => handleApplyBeatOutline("append")}
                          disabled={!selectedBeatOutline}
                        >
                          Append Selected Beats
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => handleApplyBeatOutline("replace")}
                        disabled={!selectedBeatOutline}
                      >
                        <CheckSquare className="size-4" />
                        Replace With Selected Beats
                      </Button>
                    </div>
                  }
                />

                <div className="mt-4 rounded-2xl bg-[color:rgba(184,88,63,0.08)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                  Current beats stay untouched while you review. Choose the beats you
                  want, then append or replace using only the checked lines.
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl bg-white px-4 py-4 text-sm text-[var(--ink-muted)] ring-1 ring-black/6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-[var(--ink)]">Current Beat Outline</p>
                      <Badge>{currentBeatLines.length} beat{currentBeatLines.length === 1 ? "" : "s"}</Badge>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap">
                      {planning.beatOutline.trim() || "No current beat outline yet."}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white px-4 py-4 text-sm text-[var(--ink-muted)] ring-1 ring-black/6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">Proposed Beat Outline</p>
                        <p className="mt-1 text-xs text-[var(--ink-faint)]">
                          Select only the beats you want to keep.
                        </p>
                      </div>
                      <Badge tone="accent">
                        {selectedBeatCount} of {proposedBeatLines.length} selected
                      </Badge>
                    </div>
                    {proposedBeatLines.length > 0 ? (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="px-3 py-1.5 text-xs"
                            onClick={() =>
                              setSelectedBeatIndexes(
                                proposedBeatLines.map((_, index) => index),
                              )
                            }
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => setSelectedBeatIndexes([])}
                          >
                            Clear
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {proposedBeatLines.map((beat, index) => {
                            const checked = selectedBeatIndexes.includes(index);

                            return (
                              <label
                                key={`${index}-${beat}`}
                                className={cn(
                                  "flex items-start gap-3 rounded-2xl border px-3 py-3 transition",
                                  checked
                                    ? "border-[color:rgba(184,88,63,0.32)] bg-[color:rgba(184,88,63,0.08)]"
                                    : "border-black/8 bg-white/72",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) =>
                                    setSelectedBeatIndexes((currentSelection) =>
                                      event.target.checked
                                        ? [...currentSelection, index].sort((left, right) => left - right)
                                        : currentSelection.filter(
                                            (selectedIndex) => selectedIndex !== index,
                                          ),
                                    )
                                  }
                                />
                                <div className="grid gap-1">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                                    Beat {index + 1}
                                  </span>
                                  <span className="whitespace-pre-wrap text-[var(--ink)]">
                                    {beat}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 whitespace-pre-wrap">
                        {beatReview.result.beatOutline || "No beat outline returned."}
                      </p>
                    )}
                  </div>
                </div>
              </Panel>
            ) : null}
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

            {draftReview ? (
              <Panel className="mt-4 bg-white/75 shadow-none">
                <SectionHeading
                  title="Rough Draft Review"
                  description={
                    draftReview.result.summary ||
                    draftReview.assistantMessage ||
                    "Review the generated draft against the current scene prose before applying it."
                  }
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={handleCancelDraftReview}>
                        Cancel
                      </Button>
                      {canAppendDraft ? (
                        <Button
                          variant="secondary"
                          onClick={() => handleApplyDraft("append")}
                          disabled={isBlankHtml(selectedDraftHtml)}
                        >
                          Append Selected Draft
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => handleApplyDraft("replace")}
                        disabled={isBlankHtml(selectedDraftHtml)}
                      >
                        <CheckSquare className="size-4" />
                        Replace With Selected Draft
                      </Button>
                    </div>
                  }
                />

                <div className="mt-4 rounded-2xl bg-[color:rgba(184,88,63,0.08)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                  Current draft prose stays untouched while you review. Choose the
                  blocks you want, then append or replace using only the checked prose.
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-black/8 bg-white px-5 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-[var(--ink)]">Current Draft</p>
                      <Badge>{currentDraftWordCount} word{currentDraftWordCount === 1 ? "" : "s"}</Badge>
                    </div>
                    <div className="mt-4 max-h-[18rem] overflow-y-auto">
                      {isBlankHtml(draft) ? (
                        <p className="text-sm text-[var(--ink-muted)]">
                          No current draft prose yet.
                        </p>
                      ) : (
                        <div
                          className="prose prose-sm max-w-none text-[var(--ink)]"
                          dangerouslySetInnerHTML={{ __html: draft }}
                        />
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/8 bg-white px-5 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">Proposed Draft</p>
                        <p className="mt-1 text-xs text-[var(--ink-faint)]">
                          Select the draft blocks you want to apply.
                        </p>
                      </div>
                      <Badge tone="accent">
                        {selectedDraftBlockCount} of {proposedDraftBlocks.length} selected
                      </Badge>
                    </div>
                    <div className="mt-4 max-h-[18rem] overflow-y-auto">
                      {proposedDraftBlocks.length > 0 ? (
                        <>
                          <div className="mb-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="px-3 py-1.5 text-xs"
                              onClick={() =>
                                setSelectedDraftBlockIndexes(
                                  proposedDraftBlocks.map((_, index) => index),
                                )
                              }
                            >
                              Select All
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => setSelectedDraftBlockIndexes([])}
                            >
                              Clear
                            </Button>
                          </div>
                          <div className="grid gap-3">
                            {proposedDraftBlocks.map((block, index) => {
                              const checked = selectedDraftBlockIndexes.includes(index);

                              return (
                                <label
                                  key={`${index}-${block.text.slice(0, 32)}`}
                                  className={cn(
                                    "grid gap-3 rounded-2xl border px-4 py-4 transition",
                                    checked
                                      ? "border-[color:rgba(184,88,63,0.32)] bg-[color:rgba(184,88,63,0.08)]"
                                      : "border-black/8 bg-white/72",
                                  )}
                                >
                                  <span className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) =>
                                        setSelectedDraftBlockIndexes(
                                          (currentSelection) =>
                                            event.target.checked
                                              ? [...currentSelection, index].sort(
                                                  (left, right) => left - right,
                                                )
                                              : currentSelection.filter(
                                                  (selectedIndex) =>
                                                    selectedIndex !== index,
                                                ),
                                        )
                                      }
                                    />
                                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                                      Block {index + 1}
                                    </span>
                                  </span>
                                  <div
                                    className="prose prose-sm max-w-none text-[var(--ink)]"
                                    dangerouslySetInnerHTML={{ __html: block.html }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                          <div className="mt-3 text-xs text-[var(--ink-faint)]">
                            Selected prose: {selectedDraftWordCount} word
                            {selectedDraftWordCount === 1 ? "" : "s"} across{" "}
                            {selectedDraftBlockCount} block
                            {selectedDraftBlockCount === 1 ? "" : "s"}.
                          </div>
                        </>
                      ) : (
                        <div
                          className="prose prose-sm max-w-none text-[var(--ink)]"
                          dangerouslySetInnerHTML={{
                            __html:
                              draftReview.result.manuscriptText ||
                              "<p>No draft text returned.</p>",
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </Panel>
            ) : null}
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
