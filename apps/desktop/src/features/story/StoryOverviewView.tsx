import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  Chapter,
  DomainObjectRef,
  Project,
  ProjectSnapshot,
  Scene,
  StoryBriefAlignmentNote,
  StoryStructureDiagnostic,
  StructuredAiResponse,
} from "@novelforge/domain";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  RefreshCw,
  Save,
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
  Textarea,
} from "@/components/ui";
import { useAiRuntime } from "@/hooks/useAiRuntime";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { createId } from "@/lib/ids";
import { useUiStore } from "@/store/uiStore";

type DiagnosticTone = "default" | "accent" | "warning" | "danger";

interface DiagnosticBadge {
  label: string;
  tone: DiagnosticTone;
}

interface ChapterDiagnosticSummary {
  badges: DiagnosticBadge[];
  notes: string[];
}

interface StoryReferenceJumpTarget {
  key: string;
  kind: "chapter" | "scene";
  id: string;
  chapterId: string | null;
  label: string;
}

interface StoryBriefState {
  title: string;
  logline: string;
  premise: string;
  centralConflict: string;
  thematicIntent: string;
  endingDirection: string;
  genre: string;
  tone: string;
  audienceNotes: string;
}

function emptyStoryBriefState(): StoryBriefState {
  return {
    title: "",
    logline: "",
    premise: "",
    centralConflict: "",
    thematicIntent: "",
    endingDirection: "",
    genre: "",
    tone: "",
    audienceNotes: "",
  };
}

function buildStoryBriefState(project: Project): StoryBriefState {
  return {
    title: project.title,
    logline: project.logline,
    premise: project.premise,
    centralConflict: project.centralConflict,
    thematicIntent: project.thematicIntent,
    endingDirection: project.endingDirection,
    genre: project.genre,
    tone: project.tone,
    audienceNotes: project.audienceNotes,
  };
}

function areStoryBriefStatesEqual(left: StoryBriefState, right: StoryBriefState) {
  return (
    left.title === right.title &&
    left.logline === right.logline &&
    left.premise === right.premise &&
    left.centralConflict === right.centralConflict &&
    left.thematicIntent === right.thematicIntent &&
    left.endingDirection === right.endingDirection &&
    left.genre === right.genre &&
    left.tone === right.tone &&
    left.audienceNotes === right.audienceNotes
  );
}

function getChangedStoryBriefFields(
  draft: StoryBriefState,
  persisted: StoryBriefState,
) {
  return [
    draft.title !== persisted.title ? "title" : null,
    draft.logline !== persisted.logline ? "logline" : null,
    draft.premise !== persisted.premise ? "premise" : null,
    draft.centralConflict !== persisted.centralConflict ? "centralConflict" : null,
    draft.thematicIntent !== persisted.thematicIntent ? "thematicIntent" : null,
    draft.endingDirection !== persisted.endingDirection ? "endingDirection" : null,
    draft.genre !== persisted.genre ? "genre" : null,
    draft.tone !== persisted.tone ? "tone" : null,
    draft.audienceNotes !== persisted.audienceNotes ? "audienceNotes" : null,
  ].filter((value): value is string => Boolean(value));
}

function countFilledStoryBriefFields(storyBrief: StoryBriefState) {
  return Object.values(storyBrief).filter((value) => value.trim().length > 0).length;
}

function buildOrderedChapters(snapshot: ProjectSnapshot) {
  return [...snapshot.chapters].sort((left, right) => left.orderIndex - right.orderIndex);
}

function buildChapterSceneMap(snapshot: ProjectSnapshot) {
  const chapterScenes = snapshot.scenes.reduce<Record<string, Scene[]>>((collection, scene) => {
    if (!scene.chapterId) {
      return collection;
    }

    collection[scene.chapterId] = [...(collection[scene.chapterId] ?? []), scene];
    return collection;
  }, {});

  Object.values(chapterScenes).forEach((scenes) => {
    scenes.sort((left, right) => left.orderIndex - right.orderIndex);
  });

  return chapterScenes;
}

function getChapterStructuralWarnings(chapter: Chapter, sceneCount: number): DiagnosticBadge[] {
  const warnings: DiagnosticBadge[] = [];

  if (!chapter.purpose.trim()) {
    warnings.push({ label: "No purpose", tone: "warning" });
  }

  if (!chapter.summary.trim()) {
    warnings.push({ label: "No summary", tone: "warning" });
  }

  if (sceneCount === 0) {
    warnings.push({ label: "No scenes", tone: "danger" });
  }

  return warnings;
}

function countMissingScenePlanningFields(scenes: Scene[]) {
  return scenes.reduce(
    (counts, scene) => {
      if (!scene.summary.trim()) {
        counts.missingSummaryCount += 1;
      }

      if (!scene.purpose.trim()) {
        counts.missingPurposeCount += 1;
      }

      return counts;
    },
    {
      missingSummaryCount: 0,
      missingPurposeCount: 0,
    },
  );
}

function getTypicalMappedChapterSceneCount(
  chapters: Chapter[],
  chapterScenes: Record<string, Scene[]>,
) {
  const mappedSceneCounts = chapters
    .map((chapter) => chapterScenes[chapter.id]?.length ?? 0)
    .filter((sceneCount) => sceneCount > 0)
    .sort((left, right) => left - right);

  if (mappedSceneCounts.length < 3) {
    return null;
  }

  const middleIndex = Math.floor(mappedSceneCounts.length / 2);
  if (mappedSceneCounts.length % 2 === 1) {
    return mappedSceneCounts[middleIndex];
  }

  return Math.round(
    (mappedSceneCounts[middleIndex - 1] + mappedSceneCounts[middleIndex]) / 2,
  );
}

function buildChapterDiagnosticSummary(
  chapter: Chapter,
  scenes: Scene[],
  typicalMappedChapterSceneCount: number | null,
): ChapterDiagnosticSummary {
  const badges = getChapterStructuralWarnings(chapter, scenes.length);
  const notes: string[] = [];
  const { missingSummaryCount, missingPurposeCount } = countMissingScenePlanningFields(scenes);

  if (typicalMappedChapterSceneCount !== null && scenes.length > 0) {
    if (scenes.length <= Math.max(1, typicalMappedChapterSceneCount - 2)) {
      badges.push({
        label: "Sparse for current spine",
        tone: "default",
      });
      notes.push(
        `${scenes.length} scene${scenes.length === 1 ? "" : "s"} here while the current spine usually lands around ${typicalMappedChapterSceneCount}.`,
      );
    } else if (scenes.length >= typicalMappedChapterSceneCount + 2) {
      badges.push({
        label: "Dense for current spine",
        tone: "default",
      });
      notes.push(
        `${scenes.length} scenes here while the current spine usually lands around ${typicalMappedChapterSceneCount}.`,
      );
    }
  }

  if (missingSummaryCount > 0 || missingPurposeCount > 0) {
    badges.push({
      label: "Scene planning gaps",
      tone: "warning",
    });
  }

  if (missingSummaryCount > 0) {
    notes.push(
      `${missingSummaryCount} scene${missingSummaryCount === 1 ? "" : "s"} missing summary.`,
    );
  }

  if (missingPurposeCount > 0) {
    notes.push(
      `${missingPurposeCount} scene${missingPurposeCount === 1 ? "" : "s"} missing purpose.`,
    );
  }

  return {
    badges,
    notes,
  };
}

function buildChapterSearchText(chapter: Chapter, scenes: Scene[]) {
  return [
    chapter.title,
    chapter.summary,
    chapter.purpose,
    ...scenes.flatMap((scene) => [scene.title, scene.summary, scene.purpose]),
  ]
    .join(" ")
    .toLowerCase();
}

function buildReorderedChapterIds(
  chapters: Chapter[],
  chapterId: string,
  direction: "earlier" | "later",
) {
  const currentIds = chapters.map((chapter) => chapter.id);
  const currentIndex = currentIds.indexOf(chapterId);

  if (currentIndex === -1) {
    return null;
  }

  const targetIndex = direction === "earlier" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= currentIds.length) {
    return null;
  }

  const reordered = [...currentIds];
  const [movedChapterId] = reordered.splice(currentIndex, 1);

  if (!movedChapterId) {
    return null;
  }

  reordered.splice(targetIndex, 0, movedChapterId);

  return reordered;
}

const storyDiagnosticSections: Array<{
  key: keyof StoryStructureDiagnostic;
  title: string;
  description: string;
  emptyMessage: string;
  tone: DiagnosticTone;
}> = [
  {
    key: "underdefinedChapters",
    title: "Underdefined Chapters",
    description: "Chapters whose current intent or scene support may still be too thin.",
    emptyMessage: "No obvious underdefined chapters surfaced in this review pass.",
    tone: "warning",
  },
  {
    key: "redundantFunctions",
    title: "Redundant Functions",
    description: "Places where chapters or scenes may be repeating the same job.",
    emptyMessage: "No strong redundancy concerns surfaced in this review pass.",
    tone: "default",
  },
  {
    key: "missingTransitions",
    title: "Missing Transitions",
    description: "Handoffs, bridge points, or consequence beats that may be missing.",
    emptyMessage: "No immediate transition gaps surfaced in this review pass.",
    tone: "accent",
  },
  {
    key: "briefAlignmentNotes",
    title: "Story Brief Alignment",
    description:
      "Places where the current spine supports, weakly supports, or risks drifting from the saved story intent.",
    emptyMessage: "No meaningful story-brief support or risk notes surfaced in this review pass.",
    tone: "accent",
  },
  {
    key: "endingDirectionPreparation",
    title: "Ending Direction Preparation",
    description:
      "Places where the current spine is or is not laying groundwork for the saved ending direction.",
    emptyMessage: "No ending-direction preparation notes surfaced in this review pass.",
    tone: "accent",
  },
  {
    key: "setupPayoffSupport",
    title: "Setup/Payoff Support",
    description:
      "Places where important setups, promises, or later payoffs may need stronger groundwork.",
    emptyMessage: "No setup/payoff support concerns surfaced in this review pass.",
    tone: "accent",
  },
  {
    key: "actBalanceNotes",
    title: "Act Balance / Pacing",
    description:
      "Places where the overall chapter load may feel front-heavy, thin in the middle, or overloaded late.",
    emptyMessage: "No broad act-balance or pacing concerns surfaced in this review pass.",
    tone: "accent",
  },
  {
    key: "nextPlanningTargets",
    title: "Next Planning Targets",
    description: "Highest-leverage planning passes to tackle next.",
    emptyMessage: "No extra planning targets were suggested beyond the current spine.",
    tone: "accent",
  },
];

function buildStoryReferenceLabel(
  reference: DomainObjectRef,
  chapterById: Map<string, Chapter>,
  sceneById: Map<string, Scene>,
) {
  if (reference.kind === "chapter") {
    const chapter = chapterById.get(reference.id);
    if (chapter) {
      const chapterPrefix = `chapter ${chapter.orderIndex + 1}`;
      return chapter.title.trim().toLowerCase().startsWith(chapterPrefix)
        ? chapter.title
        : `Chapter ${chapter.orderIndex + 1}: ${chapter.title}`;
    }
  }

  if (reference.kind === "scene") {
    const scene = sceneById.get(reference.id);
    if (scene) {
      const sceneLabel = `Scene ${scene.orderIndex + 1}: ${scene.title}`;
      const chapter = scene.chapterId ? chapterById.get(scene.chapterId) : null;
      return chapter
        ? `Chapter ${chapter.orderIndex + 1} · ${sceneLabel}`
        : `Unassigned · ${sceneLabel}`;
    }
  }

  return reference.title?.trim() || reference.id;
}

function buildStoryReferenceJumpTargets(
  references: DomainObjectRef[],
  chapterById: Map<string, Chapter>,
  sceneById: Map<string, Scene>,
) {
  const seen = new Set<string>();
  const jumpTargets: StoryReferenceJumpTarget[] = [];

  references.forEach((reference) => {
    const key = `${reference.kind}:${reference.id}`;
    if (seen.has(key)) {
      return;
    }

    if (reference.kind === "chapter") {
      const chapter = chapterById.get(reference.id);
      if (!chapter) {
        return;
      }

      seen.add(key);
      jumpTargets.push({
        key,
        kind: "chapter",
        id: chapter.id,
        chapterId: chapter.id,
        label: buildStoryReferenceLabel(reference, chapterById, sceneById),
      });
      return;
    }

    if (reference.kind === "scene") {
      const scene = sceneById.get(reference.id);
      if (!scene) {
        return;
      }

      seen.add(key);
      jumpTargets.push({
        key,
        kind: "scene",
        id: scene.id,
        chapterId: scene.chapterId,
        label: buildStoryReferenceLabel(reference, chapterById, sceneById),
      });
    }
  });

  return jumpTargets;
}

function buildStoryBriefAlignmentBadge(
  note: StoryBriefAlignmentNote,
): {
  label: string;
  tone: DiagnosticTone;
} {
  switch (note.alignment) {
    case "support":
      return { label: "Support", tone: "accent" };
    case "risk":
      return { label: "Risk", tone: "danger" };
    default:
      return { label: "Weak support", tone: "warning" };
  }
}

function hasMeaningfulEndingDirection(project: Project | null | undefined) {
  return Boolean(project?.endingDirection.trim());
}

function shouldShowStoryDiagnosticSection(
  sectionKey: keyof StoryStructureDiagnostic,
  project: Project | null | undefined,
) {
  return sectionKey !== "endingDirectionPreparation" || hasMeaningfulEndingDirection(project);
}

export function StoryOverviewView() {
  const navigate = useNavigate();
  const snapshotQuery = useProjectSnapshot();
  const appSettingsQuery = useAppSettings();
  const { runStructuredAiAction } = useAiRuntime();
  const { reorderChapters, saveChapter, setProjectMetadata } = useProjectRuntime();
  const searchText = useUiStore((state) => state.searchText);
  const setWorkspaceSession = useUiStore((state) => state.setWorkspaceSession);
  const setSelectedChapterId = useUiStore((state) => state.setSelectedChapterId);
  const snapshot = snapshotQuery.data;
  const appSettings = appSettingsQuery.data;
  const [storyBrief, setStoryBrief] = useState<StoryBriefState>(() =>
    snapshot ? buildStoryBriefState(snapshot.project) : emptyStoryBriefState(),
  );
  const [persistedStoryBrief, setPersistedStoryBrief] = useState<StoryBriefState>(() =>
    snapshot ? buildStoryBriefState(snapshot.project) : emptyStoryBriefState(),
  );
  const storyBriefRef = useRef(storyBrief);
  const currentProjectRef = useRef(snapshot?.project ?? null);
  const activeProjectIdRef = useRef<string | null>(null);
  const workspaceSavePromiseRef = useRef<Promise<void> | null>(null);
  const [isSavingStoryBrief, setIsSavingStoryBrief] = useState(false);
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [movingChapterId, setMovingChapterId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [storyBriefError, setStoryBriefError] = useState<string | null>(null);
  const [storyDiagnosticResponse, setStoryDiagnosticResponse] =
    useState<StructuredAiResponse | null>(null);
  const [isAnalyzingStory, setIsAnalyzingStory] = useState(false);
  const [storyDiagnosticError, setStoryDiagnosticError] = useState<string | null>(null);
  const storyBriefDirty =
    Boolean(snapshot) && !areStoryBriefStatesEqual(storyBrief, persistedStoryBrief);
  const dirtyStoryBriefFields = storyBriefDirty
    ? getChangedStoryBriefFields(storyBrief, persistedStoryBrief)
    : [];
  const dirtyAreas = storyBriefDirty ? (["planning"] as const) : [];
  const canSaveStoryBrief = storyBrief.title.trim().length > 0;

  useEffect(() => {
    storyBriefRef.current = storyBrief;
  }, [storyBrief]);

  useEffect(() => {
    currentProjectRef.current = snapshot?.project ?? null;
  }, [snapshot?.project]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const nextPersistedStoryBrief = buildStoryBriefState(snapshot.project);
    const projectChanged = activeProjectIdRef.current !== snapshot.project.id;
    activeProjectIdRef.current = snapshot.project.id;

    setPersistedStoryBrief((currentPersistedStoryBrief) => {
      if (
        projectChanged ||
        areStoryBriefStatesEqual(storyBriefRef.current, currentPersistedStoryBrief)
      ) {
        setStoryBrief(nextPersistedStoryBrief);
      }

      return nextPersistedStoryBrief;
    });
  }, [snapshot]);

  useLayoutEffect(() => {
    if (!snapshot) {
      setWorkspaceSession(null);
      return;
    }

    setWorkspaceSession({
      kind: "story",
      entityId: snapshot.project.id,
      entityTitle: storyBrief.title.trim() || snapshot.project.title || "Story Brief",
      dirtyAreas: [...dirtyAreas],
      saveChanges: saveCurrentStoryBriefChanges,
      discardChanges: discardCurrentStoryBriefChanges,
    });
  }, [dirtyAreas, setWorkspaceSession, snapshot, storyBrief.title]);

  useLayoutEffect(() => {
    const currentProjectId = snapshot?.project.id;
    if (!currentProjectId) {
      return;
    }

    return () => {
      const session = useUiStore.getState().workspaceSession;
      if (session?.kind === "story" && session.entityId === currentProjectId) {
        useUiStore.getState().setWorkspaceSession(null);
      }
    };
  }, [snapshot?.project.id]);

  if (!snapshot) {
    return null;
  }

  const currentSnapshot = snapshot;
  const orderedChapters = buildOrderedChapters(currentSnapshot);
  const chapterScenes = buildChapterSceneMap(currentSnapshot);
  const chapterById = new Map(currentSnapshot.chapters.map((chapter) => [chapter.id, chapter]));
  const sceneById = new Map(currentSnapshot.scenes.map((scene) => [scene.id, scene]));
  const typicalMappedChapterSceneCount = getTypicalMappedChapterSceneCount(
    orderedChapters,
    chapterScenes,
  );
  const visibleStoryDiagnosticSections = storyDiagnosticSections.filter((section) =>
    shouldShowStoryDiagnosticSection(section.key, currentSnapshot.project),
  );
  const chapterOrderIndex = new Map(
    orderedChapters.map((chapter, index) => [chapter.id, index]),
  );
  const defaultProviderId = appSettings?.ai.defaultProvider;
  const defaultModelId = defaultProviderId
    ? appSettings.ai.providers[defaultProviderId].defaultModel
    : "";
  const hasConfiguredAi = defaultProviderId
    ? appSettings?.ai.providers[defaultProviderId].hasApiKey &&
      defaultModelId.trim().length > 0
    : false;
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredChapters = orderedChapters.filter((chapter) => {
    if (!normalizedSearchText) {
      return true;
    }

    return buildChapterSearchText(chapter, chapterScenes[chapter.id] ?? []).includes(
      normalizedSearchText,
    );
  });
  const mappedSceneCount = currentSnapshot.scenes.filter((scene) => scene.chapterId !== null).length;
  const unassignedSceneCount =
    currentSnapshot.scenes.filter((scene) => scene.chapterId === null).length;
  const chaptersNeedingAttentionCount = orderedChapters.filter((chapter) => {
    const chapterDiagnosticSummary = buildChapterDiagnosticSummary(
      chapter,
      chapterScenes[chapter.id] ?? [],
      typicalMappedChapterSceneCount,
    );
    return chapterDiagnosticSummary.badges.length > 0;
  }).length;
  const storyDiagnosticEntryCount = visibleStoryDiagnosticSections.reduce(
    (count, section) =>
      count +
      (storyDiagnosticResponse?.result.storyStructureDiagnostic[section.key].length ?? 0),
    0,
  );
  const filledStoryBriefFieldCount = countFilledStoryBriefFields(storyBrief);
  const isMutatingStructure = isAddingChapter || movingChapterId !== null;

  function updateStoryBriefField<Key extends keyof StoryBriefState>(
    field: Key,
    value: StoryBriefState[Key],
  ) {
    setStoryBriefError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setStoryBrief((current) => ({ ...current, [field]: value }));
  }

  async function saveCurrentStoryBriefChanges() {
    if (workspaceSavePromiseRef.current) {
      return workspaceSavePromiseRef.current;
    }

    const projectToSave = currentProjectRef.current;
    if (!projectToSave || !storyBriefDirty) {
      return;
    }

    if (!canSaveStoryBrief) {
      throw new Error("Project title cannot be empty.");
    }

    setIsSavingStoryBrief(true);
    setStoryBriefError(null);

    const savePromise = (async () => {
      await setProjectMetadata({
        id: projectToSave.id,
        title: storyBrief.title.trim(),
        logline: storyBrief.logline,
        premise: storyBrief.premise,
        centralConflict: storyBrief.centralConflict,
        thematicIntent: storyBrief.thematicIntent,
        endingDirection: storyBrief.endingDirection,
        genre: storyBrief.genre,
        tone: storyBrief.tone,
        audienceNotes: storyBrief.audienceNotes,
      });
    })().finally(() => {
      workspaceSavePromiseRef.current = null;
      setIsSavingStoryBrief(false);
    });

    workspaceSavePromiseRef.current = savePromise;
    return savePromise;
  }

  async function discardCurrentStoryBriefChanges() {
    setStoryBriefError(null);
    setStoryBrief(persistedStoryBrief);
  }

  async function handleSaveStoryBrief() {
    try {
      await saveCurrentStoryBriefChanges();
    } catch (error) {
      setStoryBriefError(
        error instanceof Error
          ? error.message
          : "NovelForge could not save the story brief.",
      );
    }
  }

  async function handleAddChapter() {
    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setIsAddingChapter(true);

    try {
      const nextIndex =
        orderedChapters.reduce((max, chapter) => Math.max(max, chapter.orderIndex), -1) + 1;
      const newChapter = {
        id: createId("chapter"),
        projectId: currentSnapshot.project.id,
        title: `Chapter ${orderedChapters.length + 1}`,
        summary: "",
        purpose: "",
        majorEvents: [],
        emotionalMovement: "",
        characterFocusIds: [],
        setupPayoffNotes: "",
        orderIndex: nextIndex,
      };

      await saveChapter(newChapter);
      setSelectedChapterId(newChapter.id);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "NovelForge could not add that chapter.",
      );
    } finally {
      setIsAddingChapter(false);
    }
  }

  async function handleMoveChapter(chapterId: string, direction: "earlier" | "later") {
    const reorderedChapterIds = buildReorderedChapterIds(
      orderedChapters,
      chapterId,
      direction,
    );

    if (!reorderedChapterIds) {
      return;
    }

    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setMovingChapterId(chapterId);

    try {
      await reorderChapters(currentSnapshot.project.id, reorderedChapterIds);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "NovelForge could not update the story spine order.",
      );
    } finally {
      setMovingChapterId(null);
    }
  }

  async function handleAnalyzeStoryStructure() {
    if (!defaultProviderId || !defaultModelId.trim()) {
      return;
    }

    setIsAnalyzingStory(true);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);

    try {
      const response = await runStructuredAiAction({
        projectId: currentSnapshot.project.id,
        providerId: defaultProviderId,
        modelId: defaultModelId.trim(),
        action: "story-diagnose-structure",
        workspaceContext: "",
      });

      setStoryDiagnosticResponse(response);
    } catch (error) {
      setStoryDiagnosticError(
        error instanceof Error
          ? error.message
          : "NovelForge could not analyze the full story structure.",
      );
    } finally {
      setIsAnalyzingStory(false);
    }
  }

  async function handleOpenDiagnosticJumpTarget(target: StoryReferenceJumpTarget) {
    setSelectedChapterId(target.chapterId);

    if (target.kind === "chapter") {
      await navigate({
        to: "/chapters/$chapterId",
        params: { chapterId: target.id },
      });
      return;
    }

    await navigate({
      to: "/scenes/$sceneId",
      params: { sceneId: target.id },
    });
  }

  return (
    <Panel className="h-full min-h-0">
      <SectionHeading
        title="Story Spine"
        description="Define what the story is trying to be, then scan the full chapter spine in order so planning and diagnostics have a stronger anchor."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => void handleAnalyzeStoryStructure()}
              disabled={
                !hasConfiguredAi ||
                isMutatingStructure ||
                isAnalyzingStory ||
                isSavingStoryBrief ||
                storyBriefDirty
              }
            >
              {isAnalyzingStory ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              Analyze Story Structure
            </Button>
            <Button onClick={() => void handleAddChapter()} disabled={isMutatingStructure}>
              <Plus className="size-4" />
              {isAddingChapter ? "Adding..." : "Add Chapter"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void navigate({ to: "/chapters" })}
              disabled={isMutatingStructure}
            >
              Open Chapters Board
            </Button>
          </div>
        }
      />

      <Panel className="mt-6 bg-white/82 shadow-none">
        <SectionHeading
          title="Story Brief"
          description="Capture the top-level story intent here so the spine, diagnostics, and later AI context all point at the same target."
          actions={
            <div className="flex flex-wrap gap-3">
              <Button
                variant="ghost"
                onClick={() => void discardCurrentStoryBriefChanges()}
                disabled={!storyBriefDirty || isSavingStoryBrief}
              >
                Discard Changes
              </Button>
              <Button
                onClick={() => void handleSaveStoryBrief()}
                disabled={!storyBriefDirty || !canSaveStoryBrief || isSavingStoryBrief}
              >
                <Save className="size-4" />
                {isSavingStoryBrief
                  ? "Saving..."
                  : storyBriefDirty
                    ? "Save Story Brief"
                    : "Saved"}
              </Button>
            </div>
          }
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="accent">
            {filledStoryBriefFieldCount} of 9 anchors filled
          </Badge>
          <Badge tone={storyBriefDirty ? "warning" : "default"}>
            {storyBriefDirty
              ? `${dirtyStoryBriefFields.length} field${
                  dirtyStoryBriefFields.length === 1 ? "" : "s"
                } changed`
              : "Brief is in sync"}
          </Badge>
        </div>

        {storyBriefError ? (
          <Panel className="mt-4 bg-[color:rgba(174,67,45,0.08)] shadow-none">
            <p className="text-sm text-[var(--danger)]">{storyBriefError}</p>
          </Panel>
        ) : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.95fr)]">
          <div className="grid gap-4">
            <div className="rounded-[1.5rem] border border-black/8 bg-white/72 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                Core Story
              </p>
              <div className="mt-4 grid gap-4">
                <Field label="Title" hint="Working title">
                  <Input
                    value={storyBrief.title}
                    onChange={(event) =>
                      updateStoryBriefField("title", event.target.value)
                    }
                    placeholder="Ashen Sky"
                  />
                </Field>

                <Field label="Logline" hint="1-2 sentences">
                  <Textarea
                    rows={3}
                    value={storyBrief.logline}
                    onChange={(event) =>
                      updateStoryBriefField("logline", event.target.value)
                    }
                    placeholder="Who wants what, what stands in the way, and why it matters."
                  />
                </Field>

                <Field label="Premise" hint="Situation and setup">
                  <Textarea
                    rows={4}
                    value={storyBrief.premise}
                    onChange={(event) =>
                      updateStoryBriefField("premise", event.target.value)
                    }
                    placeholder="State the core setup the story is built around."
                  />
                </Field>

                <Field label="Central Conflict" hint="What makes the story hard?">
                  <Textarea
                    rows={4}
                    value={storyBrief.centralConflict}
                    onChange={(event) =>
                      updateStoryBriefField("centralConflict", event.target.value)
                    }
                    placeholder="Name the pressure, opposition, or impossible bind driving the story."
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.5rem] border border-black/8 bg-white/72 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                Intent and Direction
              </p>
              <div className="mt-4 grid gap-4">
                <Field label="Thematic Intent" hint="What is this exploring?">
                  <Textarea
                    rows={4}
                    value={storyBrief.thematicIntent}
                    onChange={(event) =>
                      updateStoryBriefField("thematicIntent", event.target.value)
                    }
                    placeholder="Describe the human question, tension, or idea the story wants to test."
                  />
                </Field>

                <Field label="Ending Direction" hint="How should it resolve?">
                  <Textarea
                    rows={4}
                    value={storyBrief.endingDirection}
                    onChange={(event) =>
                      updateStoryBriefField("endingDirection", event.target.value)
                    }
                    placeholder="Point toward the kind of ending the story is aiming for, even if the details may change."
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-black/8 bg-white/72 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                Positioning Notes
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Genre" hint="Optional">
                  <Input
                    value={storyBrief.genre}
                    onChange={(event) =>
                      updateStoryBriefField("genre", event.target.value)
                    }
                    placeholder="Science-fantasy adventure"
                  />
                </Field>

                <Field label="Tone" hint="Optional">
                  <Input
                    value={storyBrief.tone}
                    onChange={(event) =>
                      updateStoryBriefField("tone", event.target.value)
                    }
                    placeholder="Tense, intimate, and wonder-struck"
                  />
                </Field>

                <Field
                  label="Audience Notes"
                  hint="Optional"
                  className="md:col-span-2"
                >
                  <Textarea
                    rows={3}
                    value={storyBrief.audienceNotes}
                    onChange={(event) =>
                      updateStoryBriefField("audienceNotes", event.target.value)
                    }
                    placeholder="Capture any audience, shelf, or reading-experience notes worth protecting."
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-black/8 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Chapters
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {orderedChapters.length}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            In current story order.
          </p>
        </div>

        <div className="rounded-2xl border border-black/8 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Mapped Scenes
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{mappedSceneCount}</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Already attached to a chapter spine.
          </p>
        </div>

        <div className="rounded-2xl border border-black/8 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Chapters Needing Attention
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {chaptersNeedingAttentionCount}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Balance outliers or planning gaps worth a quick pass.
          </p>
        </div>
      </div>

      {unassignedSceneCount > 0 ? (
        <Panel className="mt-6 bg-white/75 shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {unassignedSceneCount} unassigned scene
                {unassignedSceneCount === 1 ? "" : "s"} still sit off the spine
              </p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Place them on the scene board when they are ready to join chapter order.
              </p>
            </div>
            <Button variant="secondary" onClick={() => void navigate({ to: "/scenes" })}>
              Open Scenes Board
            </Button>
          </div>
        </Panel>
      ) : null}

      {!hasConfiguredAi ? (
        <Panel className="mt-6 bg-[color:rgba(194,151,57,0.12)] shadow-none">
          <p className="text-sm text-[var(--warning)]">
            Add a default AI provider and API key in Settings to analyze the full
            story structure from the spine.
          </p>
        </Panel>
      ) : null}

      {storyDiagnosticError ? (
        <Panel className="mt-6 bg-[color:rgba(174,67,45,0.1)] shadow-none">
          <p className="text-sm text-[var(--danger)]">{storyDiagnosticError}</p>
        </Panel>
      ) : null}

      {actionError ? (
        <Panel className="mt-6 bg-[color:rgba(174,67,45,0.08)] shadow-none">
          <p className="text-sm text-[var(--danger)]">{actionError}</p>
        </Panel>
      ) : null}

      {storyDiagnosticResponse ? (
        <Panel className="mt-6 bg-white/80 shadow-none">
          <SectionHeading
            title="Story Structure Review"
            description={
              storyDiagnosticResponse.result.summary ||
              storyDiagnosticResponse.assistantMessage ||
              "Review the diagnostics below before making manual story structure changes."
            }
            actions={
              <Button
                variant="ghost"
                onClick={() => {
                  setStoryDiagnosticResponse(null);
                  setStoryDiagnosticError(null);
                }}
              >
                Clear Review
              </Button>
            }
          />

          {storyDiagnosticResponse.assistantMessage &&
          storyDiagnosticResponse.assistantMessage !==
            storyDiagnosticResponse.result.summary ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">
              {storyDiagnosticResponse.assistantMessage}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="accent">
              {storyDiagnosticEntryCount} review note
              {storyDiagnosticEntryCount === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {visibleStoryDiagnosticSections.map((section) => {
              const entries =
                storyDiagnosticResponse.result.storyStructureDiagnostic[section.key];

              return (
                <div
                  key={section.key}
                  className="rounded-[1.5rem] border border-black/8 bg-white/72 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--ink)]">
                        {section.title}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">
                        {section.description}
                      </p>
                    </div>
                    <Badge tone={section.tone}>{entries.length}</Badge>
                  </div>

                  {entries.length > 0 ? (
                    <div className="mt-4 grid gap-3">
                      {entries.map((entry, index) => {
                        const relatedReferences = entry.related.filter(
                          (reference) =>
                            !entry.focus ||
                            reference.kind !== entry.focus.kind ||
                            reference.id !== entry.focus.id,
                        );
                        const jumpTargets = buildStoryReferenceJumpTargets(
                          [
                            ...(entry.focus ? [entry.focus] : []),
                            ...relatedReferences,
                          ],
                          chapterById,
                          sceneById,
                        );
                        const briefAlignmentBadge =
                          section.key === "briefAlignmentNotes"
                            ? buildStoryBriefAlignmentBadge(entry as StoryBriefAlignmentNote)
                            : null;

                        return (
                          <div
                            key={`${section.key}-${entry.title}-${index}`}
                            className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/6"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              {briefAlignmentBadge ? (
                                <Badge tone={briefAlignmentBadge.tone}>
                                  {briefAlignmentBadge.label}
                                </Badge>
                              ) : null}
                              <p className="text-sm font-semibold text-[var(--ink)]">
                                {entry.title}
                              </p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                              {entry.detail ||
                                "Review this area in the existing chapter and scene workspaces."}
                            </p>

                            {jumpTargets.length > 0 ? (
                              <div className="mt-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                                  Jump To
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {jumpTargets.map((target) => (
                                    <Button
                                      key={target.key}
                                      type="button"
                                      variant="secondary"
                                      className="justify-start px-3 py-2 text-left"
                                      onClick={() =>
                                        void handleOpenDiagnosticJumpTarget(target)
                                      }
                                    >
                                      <ChevronRight className="size-4 shrink-0" />
                                      {target.label}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            ) : entry.focus || relatedReferences.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {entry.focus ? (
                                  <Badge tone={section.tone}>
                                    {buildStoryReferenceLabel(
                                      entry.focus,
                                      chapterById,
                                      sceneById,
                                    )}
                                  </Badge>
                                ) : null}
                                {relatedReferences.map((reference) => (
                                  <Badge
                                    key={`${section.key}-${entry.title}-${reference.kind}-${reference.id}`}
                                  >
                                    {buildStoryReferenceLabel(
                                      reference,
                                      chapterById,
                                      sceneById,
                                    )}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-5 text-sm text-[var(--ink-muted)]">
                      {section.emptyMessage}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <div className="mt-6 grid gap-4">
        {filteredChapters.length === 0 ? (
          <EmptyState
            title={normalizedSearchText ? "No chapters match this filter" : "No chapters yet"}
            description={
              normalizedSearchText
                ? "Try a different quick filter to bring chapters and scenes back into view."
                : "Create the first chapter here to start shaping the full story structure."
            }
            action={
              <Button onClick={() => void handleAddChapter()} disabled={isMutatingStructure}>
                <Plus className="size-4" />
                {isAddingChapter ? "Adding..." : "Create Chapter"}
              </Button>
            }
          />
        ) : (
          filteredChapters.map((chapter) => {
            const scenes = chapterScenes[chapter.id] ?? [];
            const chapterDiagnosticSummary = buildChapterDiagnosticSummary(
              chapter,
              scenes,
              typicalMappedChapterSceneCount,
            );
            const currentChapterIndex = chapterOrderIndex.get(chapter.id) ?? 0;
            const isFirstChapter = currentChapterIndex === 0;
            const isLastChapter = currentChapterIndex === orderedChapters.length - 1;
            return (
              <article
                key={chapter.id}
                className="rounded-[1.75rem] border border-black/8 bg-white/78 px-5 py-5 shadow-[0_18px_40px_rgba(38,27,16,0.07)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                      Chapter {chapter.orderIndex + 1}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                      {chapter.title}
                    </h3>
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">
                        {scenes.length} scene{scenes.length === 1 ? "" : "s"}
                      </Badge>
                      {chapterDiagnosticSummary.badges.map((badge) => (
                        <Badge key={`${chapter.id}-${badge.label}`} tone={badge.tone}>
                          {badge.label}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        className="px-3 py-2"
                        onClick={() => void handleMoveChapter(chapter.id, "earlier")}
                        disabled={isMutatingStructure || isFirstChapter}
                        aria-label={`Move ${chapter.title} earlier`}
                      >
                        <ArrowUp className="size-4" />
                        Earlier
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-2"
                        onClick={() => void handleMoveChapter(chapter.id, "later")}
                        disabled={isMutatingStructure || isLastChapter}
                        aria-label={`Move ${chapter.title} later`}
                      >
                        <ArrowDown className="size-4" />
                        Later
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedChapterId(chapter.id);
                          void navigate({
                            to: "/chapters/$chapterId",
                            params: { chapterId: chapter.id },
                          });
                        }}
                        disabled={isMutatingStructure}
                      >
                        Open Chapter Workspace
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-black/6 bg-white/65 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                        Purpose
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                        {chapter.purpose || "No chapter purpose captured yet."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-black/6 bg-white/65 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                        Summary
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                        {chapter.summary || "No chapter summary captured yet."}
                      </p>
                    </div>

                    {chapterDiagnosticSummary.notes.length > 0 ? (
                      <div className="rounded-2xl border border-[color:rgba(232,191,114,0.28)] bg-[color:rgba(232,191,114,0.08)] px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--warning)]">
                          Structure Signals
                        </p>
                        <div className="mt-2 grid gap-2 text-sm leading-6 text-[var(--ink-muted)]">
                          {chapterDiagnosticSummary.notes.map((note) => (
                            <p key={`${chapter.id}-${note}`}>{note}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                        Scene Path
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">
                        Open any scene workspace directly from the chapter flow.
                      </p>
                    </div>

                    {scenes.length > 0 ? (
                      <div className="grid gap-2">
                        {scenes.map((scene) => (
                          <button
                            key={scene.id}
                            className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3 text-left transition hover:border-black/15 hover:bg-white"
                            onClick={() => {
                              setSelectedChapterId(chapter.id);
                              void navigate({
                                to: "/scenes/$sceneId",
                                params: { sceneId: scene.id },
                              });
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                                  Scene {scene.orderIndex + 1}
                                </p>
                                <p className="mt-1 font-semibold text-[var(--ink)]">
                                  {scene.title}
                                </p>
                              </div>
                              <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--ink-faint)]" />
                            </div>

                            <p className="mt-2 text-sm text-[var(--ink-muted)]">
                              {scene.summary || scene.purpose || "No scene summary captured yet."}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-5 text-sm text-[var(--ink-muted)]">
                        No scenes are assigned to this chapter yet.
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </Panel>
  );
}
