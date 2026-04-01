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
  Select,
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

type SceneMovePlacement = "start" | "end" | "before" | "after";

interface UnassignedSceneMoveDraft {
  targetChapterId: string;
  placement: SceneMovePlacement;
  anchorSceneId: string;
}

interface ChapterSceneMoveDraft {
  sceneId: string;
  sourceChapterId: string;
  targetChapterId: string | null;
  placement: SceneMovePlacement;
  anchorSceneId: string;
}

const UNASSIGNED_DESTINATION_VALUE = "__unassigned__";

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

function getOrderedScenesInBucket<
  SceneLike extends { chapterId: string | null; orderIndex: number },
>(scenes: SceneLike[], chapterId: string | null) {
  return scenes
    .filter((scene) => (scene.chapterId ?? null) === chapterId)
    .sort((left, right) => left.orderIndex - right.orderIndex);
}

function buildScenePlacementDraft<SceneLike extends { id: string }>(
  targetScenes: SceneLike[],
  placement: SceneMovePlacement = "end",
  anchorSceneId = "",
) {
  const nextPlacement =
    targetScenes.length === 0 &&
    (placement === "before" || placement === "after")
      ? "end"
      : placement;
  const nextAnchorSceneId = targetScenes.some(
    (candidate) => candidate.id === anchorSceneId,
  )
    ? anchorSceneId
    : (targetScenes[0]?.id ?? "");

  return {
    placement: nextPlacement,
    anchorSceneId: nextAnchorSceneId,
  };
}

function getTargetIndexFromPlacement<SceneLike extends { id: string }>(
  targetScenes: SceneLike[],
  placement: SceneMovePlacement,
  anchorSceneId: string,
) {
  switch (placement) {
    case "start":
      return 0;
    case "end":
      return targetScenes.length;
    case "before": {
      const anchorIndex = targetScenes.findIndex(
        (scene) => scene.id === anchorSceneId,
      );
      return anchorIndex >= 0 ? anchorIndex : 0;
    }
    case "after": {
      const anchorIndex = targetScenes.findIndex(
        (scene) => scene.id === anchorSceneId,
      );
      return anchorIndex >= 0 ? anchorIndex + 1 : targetScenes.length;
    }
  }
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

function buildSceneSearchText(scene: Scene) {
  return [
    scene.title,
    scene.summary,
    scene.purpose,
    scene.location,
    scene.timeLabel,
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
  const { moveScene, reorderChapters, saveChapter, setProjectMetadata } =
    useProjectRuntime();
  const searchText = useUiStore((state) => state.searchText);
  const setWorkspaceSession = useUiStore((state) => state.setWorkspaceSession);
  const setSelectedChapterId = useUiStore((state) => state.setSelectedChapterId);
  const setDiagnosticJumpHighlight = useUiStore(
    (state) => state.setDiagnosticJumpHighlight,
  );
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
  const [movingChapterSceneId, setMovingChapterSceneId] = useState<string | null>(null);
  const [chapterSceneMoveDraft, setChapterSceneMoveDraft] =
    useState<ChapterSceneMoveDraft | null>(null);
  const [movingUnassignedSceneId, setMovingUnassignedSceneId] = useState<string | null>(null);
  const [unassignedMoveDrafts, setUnassignedMoveDrafts] = useState<
    Record<string, UnassignedSceneMoveDraft>
  >({});
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
  const unassignedScenes = getOrderedScenesInBucket(currentSnapshot.scenes, null);
  const filteredUnassignedScenes = unassignedScenes.filter((scene) => {
    if (!normalizedSearchText) {
      return true;
    }

    return buildSceneSearchText(scene).includes(normalizedSearchText);
  });
  const mappedSceneCount = currentSnapshot.scenes.filter((scene) => scene.chapterId !== null).length;
  const unassignedSceneCount = unassignedScenes.length;
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
  const isMutatingStructure =
    isAddingChapter ||
    movingChapterId !== null ||
    movingChapterSceneId !== null ||
    movingUnassignedSceneId !== null;
  const hasVisiblePlanningEntries =
    filteredChapters.length > 0 || filteredUnassignedScenes.length > 0;
  const chapterSceneMoveTargetScenes = chapterSceneMoveDraft
    ? getOrderedScenesInBucket(
        currentSnapshot.scenes,
        chapterSceneMoveDraft.targetChapterId,
      )
    : [];
  const chapterSceneMoveTargetChapter = chapterSceneMoveDraft
    ? orderedChapters.find(
        (chapter) => chapter.id === chapterSceneMoveDraft.targetChapterId,
      ) ?? null
    : null;
  const chapterSceneMoveAnchor =
    chapterSceneMoveDraft?.anchorSceneId && chapterSceneMoveTargetScenes.length > 0
      ? chapterSceneMoveTargetScenes.find(
          (candidate) => candidate.id === chapterSceneMoveDraft.anchorSceneId,
        ) ?? null
      : null;

  function buildUnassignedSceneMoveDraft(
    targetChapterId: string,
    placement: SceneMovePlacement = "end",
    anchorSceneId = "",
  ): UnassignedSceneMoveDraft {
    const targetChapterScenes = getOrderedScenesInBucket(
      currentSnapshot.scenes,
      targetChapterId,
    );
    const nextDraft = buildScenePlacementDraft(
      targetChapterScenes,
      placement,
      anchorSceneId,
    );

    return {
      targetChapterId,
      ...nextDraft,
    };
  }

  function buildChapterSceneMoveDraft(
    sceneId: string,
    sourceChapterId: string,
    targetChapterId: string | null,
    placement: SceneMovePlacement = "end",
    anchorSceneId = "",
  ): ChapterSceneMoveDraft {
    const targetChapterScenes = getOrderedScenesInBucket(
      currentSnapshot.scenes,
      targetChapterId,
    );
    const nextDraft = buildScenePlacementDraft(
      targetChapterScenes,
      placement,
      anchorSceneId,
    );

    return {
      sceneId,
      sourceChapterId,
      targetChapterId,
      ...nextDraft,
    };
  }

  function getUnassignedMoveDraft(sceneId: string) {
    const fallbackChapterId = orderedChapters[0]?.id ?? "";
    if (!fallbackChapterId) {
      return null;
    }

    const existingDraft = unassignedMoveDrafts[sceneId];
    const targetChapterId = orderedChapters.some(
      (chapter) => chapter.id === existingDraft?.targetChapterId,
    )
      ? existingDraft.targetChapterId
      : fallbackChapterId;

    return buildUnassignedSceneMoveDraft(
      targetChapterId,
      existingDraft?.placement ?? "end",
      existingDraft?.anchorSceneId ?? "",
    );
  }

  function getUnassignedTargetIndex(draft: UnassignedSceneMoveDraft) {
    const targetChapterScenes = getOrderedScenesInBucket(
      currentSnapshot.scenes,
      draft.targetChapterId,
    );

    return getTargetIndexFromPlacement(
      targetChapterScenes,
      draft.placement,
      draft.anchorSceneId,
    );
  }

  function getChapterSceneTargetIndex(draft: ChapterSceneMoveDraft) {
    const targetChapterScenes = getOrderedScenesInBucket(
      currentSnapshot.scenes,
      draft.targetChapterId,
    );

    return getTargetIndexFromPlacement(
      targetChapterScenes,
      draft.placement,
      draft.anchorSceneId,
    );
  }

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

  async function handleMoveUnassignedScene(
    sceneId: string,
    direction: "earlier" | "later",
  ) {
    const currentIndex = unassignedScenes.findIndex((scene) => scene.id === sceneId);
    if (currentIndex < 0) {
      return;
    }

    const desiredIndex = direction === "earlier" ? currentIndex - 1 : currentIndex + 1;
    if (desiredIndex < 0 || desiredIndex >= unassignedScenes.length) {
      return;
    }

    // Downward moves are modeled as insert-after positions in the backend ordering flow.
    const targetIndex = direction === "later" ? desiredIndex + 1 : desiredIndex;

    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setMovingUnassignedSceneId(sceneId);

    try {
      await moveScene({
        projectId: currentSnapshot.project.id,
        sceneId,
        targetChapterId: null,
        targetIndex,
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "NovelForge could not update the unassigned scene order.",
      );
    } finally {
      setMovingUnassignedSceneId(null);
    }
  }

  async function handleAssignUnassignedScene(sceneId: string) {
    const moveDraft = getUnassignedMoveDraft(sceneId);
    if (!moveDraft) {
      return;
    }

    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setMovingUnassignedSceneId(sceneId);

    try {
      await moveScene({
        projectId: currentSnapshot.project.id,
        sceneId,
        targetChapterId: moveDraft.targetChapterId,
        targetIndex: getUnassignedTargetIndex(moveDraft),
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "NovelForge could not place this scene onto the story spine.",
      );
    } finally {
      setMovingUnassignedSceneId(null);
    }
  }

  async function handleReorderChapterScene(
    sceneId: string,
    chapterId: string,
    direction: "earlier" | "later",
  ) {
    const currentChapterScenes = getOrderedScenesInBucket(
      currentSnapshot.scenes,
      chapterId,
    );
    const currentIndex = currentChapterScenes.findIndex(
      (scene) => scene.id === sceneId,
    );
    if (currentIndex < 0) {
      return;
    }

    const desiredIndex =
      direction === "earlier" ? currentIndex - 1 : currentIndex + 1;
    if (desiredIndex < 0 || desiredIndex >= currentChapterScenes.length) {
      return;
    }

    // Same-chapter downward moves are modeled as insert-after positions in the backend.
    const targetIndex = direction === "later" ? desiredIndex + 1 : desiredIndex;

    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setChapterSceneMoveDraft(null);
    setMovingChapterSceneId(sceneId);

    try {
      await moveScene({
        projectId: currentSnapshot.project.id,
        sceneId,
        targetChapterId: chapterId,
        targetIndex,
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "NovelForge could not reorder this scene within the chapter.",
      );
    } finally {
      setMovingChapterSceneId(null);
    }
  }

  function handleStartChapterSceneMove(sceneId: string, sourceChapterId: string) {
    const fallbackChapterId =
      orderedChapters.find((chapter) => chapter.id !== sourceChapterId)?.id ?? null;

    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setChapterSceneMoveDraft((currentDraft) =>
      currentDraft?.sceneId === sceneId
        ? currentDraft
        : buildChapterSceneMoveDraft(sceneId, sourceChapterId, fallbackChapterId),
    );
  }

  function handleCancelChapterSceneMove() {
    setChapterSceneMoveDraft(null);
  }

  async function handleMoveChapterSceneToChapter(sceneId: string) {
    if (!chapterSceneMoveDraft || chapterSceneMoveDraft.sceneId !== sceneId) {
      return;
    }

    setActionError(null);
    setStoryDiagnosticError(null);
    setStoryDiagnosticResponse(null);
    setMovingChapterSceneId(sceneId);

    try {
      await moveScene({
        projectId: currentSnapshot.project.id,
        sceneId,
        targetChapterId: chapterSceneMoveDraft.targetChapterId,
        targetIndex: getChapterSceneTargetIndex(chapterSceneMoveDraft),
      });
      setChapterSceneMoveDraft(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "NovelForge could not move this scene to the selected destination.",
      );
    } finally {
      setMovingChapterSceneId(null);
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
    setDiagnosticJumpHighlight({
      kind: target.kind,
      id: target.id,
    });
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
        {!hasVisiblePlanningEntries ? (
          <EmptyState
            title={normalizedSearchText ? "No chapters match this filter" : "No chapters yet"}
            description={
              normalizedSearchText
                ? "Try a different quick filter to bring chapters and unassigned scenes back into view."
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
          <>
            {filteredUnassignedScenes.length > 0 ? (
              <section className="rounded-[1.75rem] border border-black/8 bg-[color:rgba(232,191,114,0.08)] px-5 py-5 shadow-[0_18px_40px_rgba(38,27,16,0.07)]">
                <SectionHeading
                  title="Unassigned Scenes"
                  description="A deliberate holding area for scenes that belong in the plan, but are not yet placed on the chapter spine."
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning">
                        {filteredUnassignedScenes.length === unassignedSceneCount
                          ? `${unassignedSceneCount} scene${
                              unassignedSceneCount === 1 ? "" : "s"
                            }`
                          : `${filteredUnassignedScenes.length} of ${unassignedSceneCount} scenes`}
                      </Badge>
                      <Button
                        variant="secondary"
                        onClick={() => void navigate({ to: "/scenes" })}
                        disabled={isMutatingStructure}
                      >
                        Open Scenes Board
                      </Button>
                    </div>
                  }
                />

                <div className="mt-4 grid gap-3">
                  {filteredUnassignedScenes.map((scene) => {
                    const unassignedIndex = unassignedScenes.findIndex(
                      (candidate) => candidate.id === scene.id,
                    );
                    const isFirstUnassigned = unassignedIndex === 0;
                    const isLastUnassigned =
                      unassignedIndex === unassignedScenes.length - 1;
                    const moveDraft = getUnassignedMoveDraft(scene.id);
                    const targetChapterId = moveDraft?.targetChapterId ?? "";
                    const targetChapter =
                      orderedChapters.find((chapter) => chapter.id === targetChapterId) ??
                      null;
                    const targetChapterScenes =
                      moveDraft === null
                        ? []
                        : getOrderedScenesInBucket(
                            currentSnapshot.scenes,
                            moveDraft.targetChapterId,
                          );
                    const moveAnchor =
                      moveDraft?.anchorSceneId && targetChapterScenes.length > 0
                        ? targetChapterScenes.find(
                            (candidate) => candidate.id === moveDraft.anchorSceneId,
                          ) ?? null
                        : null;

                    return (
                      <div
                        key={scene.id}
                        className="rounded-3xl border border-black/8 bg-white/80 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--warning)]">
                              Unassigned scene {unassignedIndex + 1}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                              {scene.title}
                            </p>
                            <p className="mt-2 text-sm text-[var(--ink-muted)]">
                              {scene.summary || scene.purpose || "No scene summary captured yet."}
                            </p>
                            <p className="mt-2 text-sm text-[var(--ink-faint)]">
                              {[scene.location, scene.timeLabel].filter(Boolean).join(" · ") ||
                                "Location and time are still open."}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="ghost"
                              className="px-3 py-2"
                              onClick={() =>
                                void handleMoveUnassignedScene(scene.id, "earlier")
                              }
                              disabled={isMutatingStructure || isFirstUnassigned}
                              aria-label={`Move ${scene.title} earlier in unassigned`}
                            >
                              <ArrowUp className="size-4" />
                              Earlier
                            </Button>
                            <Button
                              variant="ghost"
                              className="px-3 py-2"
                              onClick={() =>
                                void handleMoveUnassignedScene(scene.id, "later")
                              }
                              disabled={isMutatingStructure || isLastUnassigned}
                              aria-label={`Move ${scene.title} later in unassigned`}
                            >
                              <ArrowDown className="size-4" />
                              Later
                            </Button>
                            <Button
                              variant="secondary"
                              className="px-3 py-2"
                              onClick={() => {
                                setSelectedChapterId(null);
                                void navigate({
                                  to: "/scenes/$sceneId",
                                  params: { sceneId: scene.id },
                                });
                              }}
                              disabled={isMutatingStructure}
                              aria-label={`Open ${scene.title}`}
                            >
                              <ChevronRight className="size-4" />
                              Open
                            </Button>
                          </div>
                        </div>

                        {orderedChapters.length > 0 ? (
                          <div className="mt-4 rounded-2xl border border-black/6 bg-white/72 px-4 py-4">
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_auto] lg:items-end">
                              <Field
                                label="Move Into Chapter"
                                hint="Choose the destination chapter"
                              >
                                <Select
                                  value={targetChapterId}
                                  onChange={(event) =>
                                    setUnassignedMoveDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [scene.id]: buildUnassignedSceneMoveDraft(
                                        event.target.value,
                                        moveDraft?.placement ?? "end",
                                        moveDraft?.anchorSceneId ?? "",
                                      ),
                                    }))
                                  }
                                >
                                  {orderedChapters.map((chapter) => (
                                    <option key={chapter.id} value={chapter.id}>
                                      {chapter.title}
                                    </option>
                                  ))}
                                </Select>
                              </Field>

                              <Field label="Insert Position">
                                <Select
                                  value={moveDraft?.placement ?? "end"}
                                  onChange={(event) =>
                                    setUnassignedMoveDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [scene.id]: buildUnassignedSceneMoveDraft(
                                        targetChapterId,
                                        event.target.value as UnassignedSceneMoveDraft["placement"],
                                        moveDraft?.anchorSceneId ?? "",
                                      ),
                                    }))
                                  }
                                >
                                  <option value="start">At chapter beginning</option>
                                  <option value="end">At chapter end</option>
                                  {targetChapterScenes.length > 0 ? (
                                    <>
                                      <option value="before">Before selected scene</option>
                                      <option value="after">After selected scene</option>
                                    </>
                                  ) : null}
                                </Select>
                              </Field>

                              <Button
                                onClick={() => void handleAssignUnassignedScene(scene.id)}
                                disabled={!targetChapterId || isMutatingStructure}
                              >
                                Move to Chapter
                              </Button>
                            </div>

                            {moveDraft?.placement === "before" ||
                            moveDraft?.placement === "after" ? (
                              <div className="mt-3 max-w-xl">
                                <Field
                                  label={
                                    moveDraft.placement === "before"
                                      ? "Before Scene"
                                      : "After Scene"
                                  }
                                >
                                  <Select
                                    value={moveDraft.anchorSceneId}
                                    onChange={(event) =>
                                      setUnassignedMoveDrafts((currentDrafts) => ({
                                        ...currentDrafts,
                                        [scene.id]: {
                                          ...(moveDraft ?? buildUnassignedSceneMoveDraft(targetChapterId)),
                                          anchorSceneId: event.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    {targetChapterScenes.map((candidate, targetIndex) => (
                                      <option key={candidate.id} value={candidate.id}>
                                        {targetIndex + 1}. {candidate.title}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                            ) : null}

                            <p className="mt-2 text-sm text-[var(--ink-muted)]">
                              {moveDraft?.placement === "start"
                                ? `The scene will be inserted at the beginning of ${targetChapter?.title ?? "the selected chapter"}.`
                                : moveDraft?.placement === "end"
                                  ? `The scene will be inserted at the end of ${targetChapter?.title ?? "the selected chapter"}.`
                                  : moveDraft?.placement === "before"
                                    ? `The scene will be inserted before ${moveAnchor?.title ?? "the selected scene"} in ${targetChapter?.title ?? "the selected chapter"}.`
                                    : `The scene will be inserted after ${moveAnchor?.title ?? "the selected scene"} in ${targetChapter?.title ?? "the selected chapter"}.`}{" "}
                              NovelForge will persist that choice through the saved backend order.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm text-[var(--ink-muted)]">
                            Create the first chapter when you are ready to place this
                            scene onto the spine.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {filteredChapters.map((chapter) => {
              const scenes = chapterScenes[chapter.id] ?? [];
              const chapterDiagnosticSummary = buildChapterDiagnosticSummary(
                chapter,
                scenes,
                typicalMappedChapterSceneCount,
              );
              const currentChapterIndex = chapterOrderIndex.get(chapter.id) ?? 0;
              const isFirstChapter = currentChapterIndex === 0;
              const isLastChapter = currentChapterIndex === orderedChapters.length - 1;
              const chapterMoveDestinations = [
                ...orderedChapters
                  .filter((candidate) => candidate.id !== chapter.id)
                  .map((candidate) => ({
                    id: candidate.id,
                    label: candidate.title,
                  })),
                {
                  id: null,
                  label: "Unassigned",
                },
              ];
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
                          Reorder scenes here, open any scene workspace directly from
                          the chapter flow, or move a scene into another chapter or
                          back to Unassigned without leaving Story Spine.
                        </p>
                      </div>

                      {scenes.length > 0 ? (
                        <div className="grid gap-2">
                          {scenes.map((scene) => {
                            const currentSceneIndex = scenes.findIndex(
                              (candidate) => candidate.id === scene.id,
                            );
                            const isFirstChapterScene = currentSceneIndex === 0;
                            const isLastChapterScene =
                              currentSceneIndex === scenes.length - 1;
                            const isMovingChapterScene =
                              chapterSceneMoveDraft?.sceneId === scene.id;
                            const targetChapterScenes = isMovingChapterScene
                              ? chapterSceneMoveTargetScenes
                              : [];
                            const targetChapter = isMovingChapterScene
                              ? chapterSceneMoveTargetChapter
                              : null;
                            const moveAnchor = isMovingChapterScene
                              ? chapterSceneMoveAnchor
                              : null;

                            return (
                              <div
                                key={scene.id}
                                className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                                      Scene {scene.orderIndex + 1}
                                    </p>
                                    <p className="mt-1 font-semibold text-[var(--ink)]">
                                      {scene.title}
                                    </p>
                                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                      {scene.summary ||
                                        scene.purpose ||
                                        "No scene summary captured yet."}
                                    </p>
                                  </div>

                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="px-3 py-2"
                                      onClick={() =>
                                        void handleReorderChapterScene(
                                          scene.id,
                                          chapter.id,
                                          "earlier",
                                        )
                                      }
                                      disabled={isMutatingStructure || isFirstChapterScene}
                                      aria-label={`Move ${scene.title} earlier in ${chapter.title}`}
                                    >
                                      <ArrowUp className="size-4" />
                                      Earlier
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="px-3 py-2"
                                      onClick={() =>
                                        void handleReorderChapterScene(
                                          scene.id,
                                          chapter.id,
                                          "later",
                                        )
                                      }
                                      disabled={isMutatingStructure || isLastChapterScene}
                                      aria-label={`Move ${scene.title} later in ${chapter.title}`}
                                    >
                                      <ArrowDown className="size-4" />
                                      Later
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="px-3 py-2"
                                      onClick={() =>
                                        handleStartChapterSceneMove(
                                          scene.id,
                                          chapter.id,
                                        )
                                      }
                                      disabled={isMutatingStructure}
                                      aria-label={`Move ${scene.title} to another chapter or unassigned`}
                                    >
                                      Move...
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      className="px-3 py-2"
                                      onClick={() => {
                                        setSelectedChapterId(chapter.id);
                                        void navigate({
                                          to: "/scenes/$sceneId",
                                          params: { sceneId: scene.id },
                                        });
                                      }}
                                      disabled={isMutatingStructure}
                                      aria-label={`Open ${scene.title}`}
                                    >
                                      <ChevronRight className="size-4" />
                                      Open
                                    </Button>
                                  </div>
                                </div>

                                {isMovingChapterScene && chapterSceneMoveDraft ? (
                                    <div className="mt-4 rounded-2xl border border-black/6 bg-white/72 px-4 py-4">
                                      <div className="grid gap-3 lg:grid-cols-2">
                                      <Field
                                        label="Move Destination"
                                        hint="Choose the destination chapter or unassigned bucket"
                                      >
                                        <Select
                                          value={
                                            chapterSceneMoveDraft.targetChapterId ??
                                            UNASSIGNED_DESTINATION_VALUE
                                          }
                                          onChange={(event) =>
                                            setChapterSceneMoveDraft((currentDraft) =>
                                              currentDraft?.sceneId === scene.id
                                                ? buildChapterSceneMoveDraft(
                                                    scene.id,
                                                    chapter.id,
                                                    event.target.value ===
                                                      UNASSIGNED_DESTINATION_VALUE
                                                      ? null
                                                      : event.target.value,
                                                    currentDraft.placement,
                                                    currentDraft.anchorSceneId,
                                                  )
                                                : currentDraft,
                                            )
                                          }
                                        >
                                          {chapterMoveDestinations.map((candidate) => (
                                            <option
                                              key={
                                                candidate.id ??
                                                UNASSIGNED_DESTINATION_VALUE
                                              }
                                              value={
                                                candidate.id ??
                                                UNASSIGNED_DESTINATION_VALUE
                                              }
                                            >
                                              {candidate.label}
                                            </option>
                                          ))}
                                        </Select>
                                      </Field>

                                      <Field label="Insert Position">
                                        <Select
                                          value={chapterSceneMoveDraft.placement}
                                          onChange={(event) =>
                                            setChapterSceneMoveDraft((currentDraft) =>
                                              currentDraft?.sceneId === scene.id
                                                ? buildChapterSceneMoveDraft(
                                                    scene.id,
                                                    chapter.id,
                                                    currentDraft.targetChapterId,
                                                    event.target
                                                      .value as SceneMovePlacement,
                                                    currentDraft.anchorSceneId,
                                                  )
                                                : currentDraft,
                                            )
                                          }
                                        >
                                          <option value="start">At chapter beginning</option>
                                          <option value="end">At chapter end</option>
                                          {targetChapterScenes.length > 0 ? (
                                            <>
                                              <option value="before">
                                                Before selected scene
                                              </option>
                                              <option value="after">
                                                After selected scene
                                              </option>
                                            </>
                                          ) : null}
                                        </Select>
                                      </Field>
                                    </div>

                                    {chapterSceneMoveDraft.placement === "before" ||
                                    chapterSceneMoveDraft.placement === "after" ? (
                                      <div className="mt-3 max-w-xl">
                                        <Field
                                          label={
                                            chapterSceneMoveDraft.placement === "before"
                                              ? "Before Scene"
                                              : "After Scene"
                                          }
                                        >
                                          <Select
                                            value={chapterSceneMoveDraft.anchorSceneId}
                                            onChange={(event) =>
                                              setChapterSceneMoveDraft((currentDraft) =>
                                                currentDraft?.sceneId === scene.id
                                                  ? {
                                                      ...currentDraft,
                                                      anchorSceneId: event.target.value,
                                                    }
                                                  : currentDraft,
                                              )
                                            }
                                          >
                                            {targetChapterScenes.map(
                                              (candidate, targetIndex) => (
                                                <option
                                                  key={candidate.id}
                                                  value={candidate.id}
                                                >
                                                  {targetIndex + 1}. {candidate.title}
                                                </option>
                                              ),
                                            )}
                                          </Select>
                                        </Field>
                                      </div>
                                    ) : null}

                                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                      {chapterSceneMoveDraft.placement === "start"
                                        ? `The scene will be inserted at the beginning of ${targetChapter?.title ?? "the unassigned scene list"}.`
                                        : chapterSceneMoveDraft.placement === "end"
                                          ? `The scene will be inserted at the end of ${targetChapter?.title ?? "the unassigned scene list"}.`
                                          : chapterSceneMoveDraft.placement === "before"
                                            ? `The scene will be inserted before ${moveAnchor?.title ?? "the selected scene"} in ${targetChapter?.title ?? "the unassigned scene list"}.`
                                            : `The scene will be inserted after ${moveAnchor?.title ?? "the selected scene"} in ${targetChapter?.title ?? "the unassigned scene list"}.`}{" "}
                                      NovelForge will persist that choice through the saved
                                      backend order.
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={handleCancelChapterSceneMove}
                                        disabled={movingChapterSceneId === scene.id}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        onClick={() =>
                                          void handleMoveChapterSceneToChapter(scene.id)
                                        }
                                        disabled={isMutatingStructure}
                                      >
                                        Move Scene
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
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
            })}
          </>
        )}
      </div>
    </Panel>
  );
}
