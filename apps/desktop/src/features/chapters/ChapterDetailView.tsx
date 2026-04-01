import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { Chapter, StructuredAiResponse } from "@novelforge/domain";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckSquare,
  FileText,
  ListOrdered,
  Plus,
  RefreshCw,
  Save,
  Target,
  Trash2,
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
  Select,
  SectionHeading,
  Textarea,
} from "@/components/ui";
import { useAiRuntime } from "@/hooks/useAiRuntime";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { cn, splitLines } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { createEmptySceneInput } from "@/features/scenes/sceneFactories";

interface ChapterPlanningState {
  title: string;
  summary: string;
  purpose: string;
  majorEvents: string;
  emotionalMovement: string;
  setupPayoffNotes: string;
  characterFocusIds: string[];
}

function emptyChapterPlanningState(): ChapterPlanningState {
  return {
    title: "",
    summary: "",
    purpose: "",
    majorEvents: "",
    emotionalMovement: "",
    setupPayoffNotes: "",
    characterFocusIds: [],
  };
}

function buildChapterPlanningState(chapter: Chapter): ChapterPlanningState {
  return {
    title: chapter.title,
    summary: chapter.summary,
    purpose: chapter.purpose,
    majorEvents: chapter.majorEvents.join("\n"),
    emotionalMovement: chapter.emotionalMovement,
    setupPayoffNotes: chapter.setupPayoffNotes,
    characterFocusIds: [...chapter.characterFocusIds],
  };
}

function areStringListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function arePlanningStatesEqual(
  left: ChapterPlanningState,
  right: ChapterPlanningState,
) {
  return (
    left.title === right.title &&
    left.summary === right.summary &&
    left.purpose === right.purpose &&
    left.majorEvents === right.majorEvents &&
    left.emotionalMovement === right.emotionalMovement &&
    left.setupPayoffNotes === right.setupPayoffNotes &&
    areStringListsEqual(left.characterFocusIds, right.characterFocusIds)
  );
}

function getChangedFields(
  planning: ChapterPlanningState,
  persistedPlanning: ChapterPlanningState,
) {
  return [
    planning.title !== persistedPlanning.title ? "title" : null,
    planning.summary !== persistedPlanning.summary ? "summary" : null,
    planning.purpose !== persistedPlanning.purpose ? "purpose" : null,
    planning.majorEvents !== persistedPlanning.majorEvents ? "majorEvents" : null,
    planning.emotionalMovement !== persistedPlanning.emotionalMovement
      ? "emotionalMovement"
      : null,
    planning.setupPayoffNotes !== persistedPlanning.setupPayoffNotes
      ? "setupPayoffNotes"
      : null,
    !areStringListsEqual(
      planning.characterFocusIds,
      persistedPlanning.characterFocusIds,
    )
      ? "characterFocusIds"
      : null,
  ].filter((value): value is string => Boolean(value));
}

type ChapterSceneProposalDraft = StructuredAiResponse["result"]["sceneProposals"][number] & {
  reviewId: string;
  selected: boolean;
};

interface ChapterScenePreview {
  id: string;
  orderIndex: number;
  title: string;
  summary: string;
  purpose: string;
  outcome: string;
}

interface ChapterSceneMoveDraft {
  sceneId: string;
  targetChapterId: string;
  placement: "start" | "end" | "before" | "after";
  anchorSceneId: string;
}

interface ProposalOverlapWarning {
  sceneId: string;
  sceneTitle: string;
  severity: "duplicate" | "overlap";
  reason: string;
}

function normalizeComparisonText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildComparisonTerms(value: string) {
  return Array.from(
    new Set(
      normalizeComparisonText(value)
        .split(" ")
        .filter((term) => term.length >= 4),
    ),
  );
}

function buildProposalOverlapWarnings(
  proposal: Pick<ChapterSceneProposalDraft, "title" | "summary" | "purpose">,
  chapterScenes: ChapterScenePreview[],
) {
  const proposalTitle = normalizeComparisonText(proposal.title);
  const proposalSummary = normalizeComparisonText(proposal.summary);
  const proposalTerms = buildComparisonTerms(
    [proposal.title, proposal.summary, proposal.purpose].join(" "),
  );

  return chapterScenes
    .map((scene): ProposalOverlapWarning | null => {
      const sceneTitle = normalizeComparisonText(scene.title);
      const sceneSummary = normalizeComparisonText(scene.summary);
      const sceneTerms = buildComparisonTerms(
        [scene.title, scene.summary, scene.purpose, scene.outcome].join(" "),
      );
      const sharedTerms = proposalTerms.filter((term) => sceneTerms.includes(term));
      const titleMatch =
        proposalTitle.length > 0 &&
        (proposalTitle === sceneTitle ||
          proposalTitle.includes(sceneTitle) ||
          sceneTitle.includes(proposalTitle));
      const summaryMatch =
        proposalSummary.length > 0 && proposalSummary === sceneSummary;
      const overlapRatio =
        sharedTerms.length /
        Math.max(Math.min(proposalTerms.length, sceneTerms.length), 1);

      if (titleMatch || summaryMatch) {
        return {
          sceneId: scene.id,
          sceneTitle: scene.title,
          severity: "duplicate",
          reason: `Likely duplicates "${scene.title}".`,
        };
      }

      if (sharedTerms.length >= 3 && overlapRatio >= 0.45) {
        return {
          sceneId: scene.id,
          sceneTitle: scene.title,
          severity: "overlap",
          reason: `May overlap with "${scene.title}" around ${sharedTerms
            .slice(0, 3)
            .join(", ")}.`,
        };
      }

      return null;
    })
    .filter((warning): warning is ProposalOverlapWarning => Boolean(warning))
    .sort((left, right) =>
      left.severity === right.severity
        ? left.sceneTitle.localeCompare(right.sceneTitle)
        : left.severity === "duplicate"
          ? -1
          : 1,
    );
}

function buildChapterWorkspaceAiContext(
  chapter: Chapter,
  planning: ChapterPlanningState,
  chapterScenes: ChapterScenePreview[],
  focusedCharacters: Array<{ id: string; name: string; role: string }>,
) {
  return JSON.stringify(
    {
      chapterPlanningDraft: {
        id: chapter.id,
        title: planning.title,
        summary: planning.summary,
        purpose: planning.purpose,
        majorEvents: splitLines(planning.majorEvents),
        emotionalMovement: planning.emotionalMovement,
        setupPayoffNotes: planning.setupPayoffNotes,
        characterFocusIds: planning.characterFocusIds,
      },
      currentChapterScenes: chapterScenes.map((scene) => ({
        id: scene.id,
        orderIndex: scene.orderIndex,
        title: scene.title,
        summary: scene.summary,
        purpose: scene.purpose,
        outcome: scene.outcome,
      })),
      focusedCharacters,
    },
    null,
    2,
  );
}

function getOrderedScenesInChapter<
  SceneLike extends { chapterId: string | null; orderIndex: number },
>(scenes: SceneLike[], chapterId: string | null) {
  return scenes
    .filter((scene) => (scene.chapterId ?? null) === chapterId)
    .sort((left, right) => left.orderIndex - right.orderIndex);
}

export function ChapterDetailView() {
  const navigate = useNavigate();
  const { chapterId } = useParams({ from: "/chapters/$chapterId" });
  const snapshotQuery = useProjectSnapshot();
  const appSettingsQuery = useAppSettings();
  const { runStructuredAiAction } = useAiRuntime();
  const { moveScene, saveChapter, saveScene } = useProjectRuntime();
  const setWorkspaceSession = useUiStore((state) => state.setWorkspaceSession);
  const setSelectedChapterId = useUiStore((state) => state.setSelectedChapterId);
  const diagnosticJumpHighlight = useUiStore((state) => state.diagnosticJumpHighlight);
  const setDiagnosticJumpHighlight = useUiStore(
    (state) => state.setDiagnosticJumpHighlight,
  );
  const snapshot = snapshotQuery.data;
  const appSettings = appSettingsQuery.data;

  const chapter = snapshot?.chapters.find((item) => item.id === chapterId);
  const [planning, setPlanning] = useState<ChapterPlanningState>(() =>
    chapter ? buildChapterPlanningState(chapter) : emptyChapterPlanningState(),
  );
  const [persistedPlanning, setPersistedPlanning] = useState<ChapterPlanningState>(() =>
    chapter ? buildChapterPlanningState(chapter) : emptyChapterPlanningState(),
  );
  const planningRef = useRef(planning);
  const currentChapterRef = useRef(chapter ?? null);
  const activeChapterIdRef = useRef<string | null>(null);
  const workspaceSavePromiseRef = useRef<Promise<void> | null>(null);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [sceneProposalResponse, setSceneProposalResponse] =
    useState<StructuredAiResponse | null>(null);
  const [sceneProposalDrafts, setSceneProposalDrafts] = useState<
    ChapterSceneProposalDraft[]
  >([]);
  const [isGeneratingSceneProposals, setIsGeneratingSceneProposals] = useState(false);
  const [isApplyingSceneProposals, setIsApplyingSceneProposals] = useState(false);
  const [sceneProposalError, setSceneProposalError] = useState<string | null>(null);
  const [sceneProposalMessage, setSceneProposalMessage] = useState<string | null>(null);
  const [movingSceneId, setMovingSceneId] = useState<string | null>(null);
  const [sceneMoveDraft, setSceneMoveDraft] = useState<ChapterSceneMoveDraft | null>(
    null,
  );
  const [sceneMoveError, setSceneMoveError] = useState<string | null>(null);
  const chapterJumpHighlightRef = useRef<HTMLElement | null>(null);
  const [isJumpHighlighted, setIsJumpHighlighted] = useState(false);

  useEffect(() => {
    planningRef.current = planning;
  }, [planning]);

  useEffect(() => {
    currentChapterRef.current = chapter ?? null;
  }, [chapter]);

  useEffect(() => {
    if (!chapter) {
      return;
    }

    const nextPersistedPlanning = buildChapterPlanningState(chapter);
    const chapterChanged = activeChapterIdRef.current !== chapter.id;
    activeChapterIdRef.current = chapter.id;

    setPersistedPlanning((currentPersistedPlanning) => {
      if (
        chapterChanged ||
        arePlanningStatesEqual(planningRef.current, currentPersistedPlanning)
      ) {
        setPlanning(nextPersistedPlanning);
      }
      return nextPersistedPlanning;
    });
    setSelectedChapterId(chapter.id);
  }, [chapter, setSelectedChapterId]);

  useEffect(() => {
    setSceneProposalResponse(null);
    setSceneProposalDrafts([]);
    setSceneProposalError(null);
    setSceneProposalMessage(null);
    setMovingSceneId(null);
    setSceneMoveDraft(null);
    setSceneMoveError(null);
  }, [chapter?.id]);

  const chapterDirty = Boolean(chapter) && !arePlanningStatesEqual(planning, persistedPlanning);
  const dirtyAreas = chapterDirty ? (["planning"] as const) : [];
  const canSave = planning.title.trim().length > 0;

  useLayoutEffect(() => {
    if (!chapter) {
      setWorkspaceSession(null);
      return;
    }

    setWorkspaceSession({
      kind: "chapter",
      entityId: chapter.id,
      entityTitle: planning.title.trim() || chapter.title,
      dirtyAreas: [...dirtyAreas],
      saveChanges: saveCurrentWorkspaceChanges,
      discardChanges: discardCurrentWorkspaceChanges,
    });
  }, [chapter, dirtyAreas, planning.title, setWorkspaceSession]);

  useLayoutEffect(() => {
    if (!chapter) {
      return;
    }

    const currentChapterId = chapter.id;
    return () => {
      const session = useUiStore.getState().workspaceSession;
      if (session?.kind === "chapter" && session.entityId === currentChapterId) {
        useUiStore.getState().setWorkspaceSession(null);
      }
    };
  }, [chapter?.id]);

  useEffect(() => {
    if (!chapter || diagnosticJumpHighlight?.kind !== "chapter") {
      return;
    }

    if (diagnosticJumpHighlight.id !== chapter.id) {
      return;
    }

    setIsJumpHighlighted(true);
    setDiagnosticJumpHighlight(null);

    const highlightNode = chapterJumpHighlightRef.current;
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
  }, [chapter, diagnosticJumpHighlight, setDiagnosticJumpHighlight]);

  if (!snapshot) {
    return null;
  }

  if (!chapter) {
    return (
      <Panel>
        <EmptyState
          title="Chapter not found"
          description="The requested chapter could not be found in the current project."
        />
      </Panel>
    );
  }

  const currentSnapshot = snapshot;
  const currentChapter = chapter;
  const chapterScenes = getOrderedScenesInChapter(
    currentSnapshot.scenes,
    currentChapter.id,
  );
  const otherChapters = [...currentSnapshot.chapters]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .filter((candidate) => candidate.id !== currentChapter.id);
  const targetChapterScenes = sceneMoveDraft
    ? getOrderedScenesInChapter(
        currentSnapshot.scenes,
        sceneMoveDraft.targetChapterId,
      )
    : [];
  const targetChapter = sceneMoveDraft
    ? currentSnapshot.chapters.find(
        (candidate) => candidate.id === sceneMoveDraft.targetChapterId,
      ) ?? null
    : null;
  const sceneMoveAnchor =
    sceneMoveDraft && sceneMoveDraft.anchorSceneId
      ? targetChapterScenes.find(
          (candidate) => candidate.id === sceneMoveDraft.anchorSceneId,
        ) ?? null
      : null;
  const focusedCharacters = currentSnapshot.characters.filter((character) =>
    planning.characterFocusIds.includes(character.id),
  );
  const defaultProviderId = appSettings?.ai.defaultProvider;
  const defaultModelId = defaultProviderId
    ? appSettings.ai.providers[defaultProviderId].defaultModel
    : "";
  const hasConfiguredAi = defaultProviderId
    ? appSettings?.ai.providers[defaultProviderId].hasApiKey &&
      defaultModelId.trim().length > 0
    : false;
  const selectedSceneProposalCount = sceneProposalDrafts.filter(
    (proposal) => proposal.selected,
  ).length;
  const hasUntitledSelectedSceneProposal = sceneProposalDrafts.some(
    (proposal) => proposal.selected && proposal.title.trim().length === 0,
  );

  function updatePlanningField<Key extends keyof ChapterPlanningState>(
    field: Key,
    value: ChapterPlanningState[Key],
  ) {
    setPlanning((current) => ({ ...current, [field]: value }));
  }

  function updateSceneProposalDraft<
    Key extends keyof Pick<ChapterSceneProposalDraft, "title" | "summary" | "purpose">,
  >(reviewId: string, field: Key, value: ChapterSceneProposalDraft[Key]) {
    setSceneProposalDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.reviewId === reviewId ? { ...draft, [field]: value } : draft,
      ),
    );
  }

  function toggleSceneProposal(reviewId: string) {
    setSceneProposalDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.reviewId === reviewId
          ? { ...draft, selected: !draft.selected }
          : draft,
      ),
    );
  }

  function removeSceneProposal(reviewId: string) {
    setSceneProposalDrafts((currentDrafts) =>
      currentDrafts.filter((draft) => draft.reviewId !== reviewId),
    );
  }

  function buildSceneMoveDraft(
    sceneId: string,
    targetChapterId: string,
    placement: ChapterSceneMoveDraft["placement"] = "end",
    anchorSceneId = "",
  ): ChapterSceneMoveDraft {
    const nextTargetChapterScenes = getOrderedScenesInChapter(
      currentSnapshot.scenes,
      targetChapterId,
    );
    const nextPlacement =
      nextTargetChapterScenes.length === 0 &&
      (placement === "before" || placement === "after")
        ? "end"
        : placement;
    const nextAnchorSceneId = nextTargetChapterScenes.some(
      (candidate) => candidate.id === anchorSceneId,
    )
      ? anchorSceneId
      : (nextTargetChapterScenes[0]?.id ?? "");

    return {
      sceneId,
      targetChapterId,
      placement: nextPlacement,
      anchorSceneId: nextAnchorSceneId,
    };
  }

  function getCrossChapterTargetIndex(draft: ChapterSceneMoveDraft) {
    const nextTargetChapterScenes = getOrderedScenesInChapter(
      currentSnapshot.scenes,
      draft.targetChapterId,
    );

    switch (draft.placement) {
      case "start":
        return 0;
      case "end":
        return nextTargetChapterScenes.length;
      case "before": {
        const anchorIndex = nextTargetChapterScenes.findIndex(
          (scene) => scene.id === draft.anchorSceneId,
        );
        return anchorIndex >= 0 ? anchorIndex : 0;
      }
      case "after": {
        const anchorIndex = nextTargetChapterScenes.findIndex(
          (scene) => scene.id === draft.anchorSceneId,
        );
        return anchorIndex >= 0
          ? anchorIndex + 1
          : nextTargetChapterScenes.length;
      }
    }
  }

  async function saveCurrentWorkspaceChanges() {
    if (workspaceSavePromiseRef.current) {
      return workspaceSavePromiseRef.current;
    }

    const chapterToSave = currentChapterRef.current;
    if (!chapterToSave || !chapterDirty) {
      return;
    }

    if (!canSave) {
      throw new Error("Chapter title cannot be empty.");
    }

    setIsSavingWorkspace(true);

    const savePromise = (async () => {
      await saveChapter(
        {
          id: chapterToSave.id,
          projectId: chapterToSave.projectId,
          title: planning.title.trim(),
          summary: planning.summary,
          purpose: planning.purpose,
          majorEvents: splitLines(planning.majorEvents),
          emotionalMovement: planning.emotionalMovement,
          characterFocusIds: planning.characterFocusIds,
          setupPayoffNotes: planning.setupPayoffNotes,
          orderIndex: chapterToSave.orderIndex,
        },
        {
          id: crypto.randomUUID(),
          projectId: chapterToSave.projectId,
          occurredAt: new Date().toISOString(),
          type: "chapter.updated",
          chapterId: chapterToSave.id,
          changedFields: getChangedFields(planning, persistedPlanning),
        },
      );
    })().finally(() => {
      workspaceSavePromiseRef.current = null;
      setIsSavingWorkspace(false);
    });

    workspaceSavePromiseRef.current = savePromise;
    return savePromise;
  }

  async function discardCurrentWorkspaceChanges() {
    setPlanning(persistedPlanning);
  }

  async function handleSaveChapter() {
    await saveCurrentWorkspaceChanges();
  }

  async function handleCreateScene() {
    await saveScene(
      createEmptySceneInput({
        projectId: currentSnapshot.project.id,
        chapterId: currentChapter.id,
        orderIndex: chapterScenes.length,
        title: `Scene ${chapterScenes.length + 1}`,
      }),
    );
  }

  async function handleMoveScene(sceneId: string, direction: -1 | 1) {
    const currentIndex = chapterScenes.findIndex((scene) => scene.id === sceneId);
    if (currentIndex < 0) {
      return;
    }

    const desiredIndex = currentIndex + direction;
    if (desiredIndex < 0 || desiredIndex >= chapterScenes.length) {
      return;
    }

    // Same-chapter downward moves are modeled as insert-after positions in the backend.
    const targetIndex =
      desiredIndex > currentIndex ? desiredIndex + 1 : desiredIndex;

    setSceneMoveError(null);
    setSceneMoveDraft(null);
    setMovingSceneId(sceneId);

    try {
      await moveScene({
        projectId: currentSnapshot.project.id,
        sceneId,
        targetChapterId: currentChapter.id,
        targetIndex,
      });
    } catch (error) {
      setSceneMoveError(
        error instanceof Error
          ? error.message
          : "NovelForge could not move this scene right now.",
      );
    } finally {
      setMovingSceneId(null);
    }
  }

  function handleStartCrossChapterMove(sceneId: string) {
    if (otherChapters.length === 0) {
      return;
    }

    setSceneMoveError(null);
    setSceneMoveDraft((currentDraft) =>
      currentDraft?.sceneId === sceneId
        ? currentDraft
        : buildSceneMoveDraft(sceneId, otherChapters[0].id),
    );
  }

  function handleCancelCrossChapterMove() {
    setSceneMoveDraft(null);
  }

  async function handleMoveSceneToChapter(sceneId: string) {
    if (!sceneMoveDraft || sceneMoveDraft.sceneId !== sceneId) {
      return;
    }

    const targetChapterId = sceneMoveDraft.targetChapterId;
    const targetIndex = getCrossChapterTargetIndex(sceneMoveDraft);

    setSceneMoveError(null);
    setMovingSceneId(sceneId);

    try {
      await moveScene({
        projectId: currentSnapshot.project.id,
        sceneId,
        targetChapterId,
        targetIndex,
      });
      setSceneMoveDraft(null);
    } catch (error) {
      setSceneMoveError(
        error instanceof Error
          ? error.message
          : "NovelForge could not move this scene right now.",
      );
    } finally {
      setMovingSceneId(null);
    }
  }

  async function handleProposeScenes() {
    if (!defaultProviderId || !defaultModelId.trim()) {
      return;
    }

    setIsGeneratingSceneProposals(true);
    setSceneProposalError(null);
    setSceneProposalMessage(null);
    setSceneProposalResponse(null);

    try {
      const response = await runStructuredAiAction({
        projectId: currentSnapshot.project.id,
        providerId: defaultProviderId,
        modelId: defaultModelId.trim(),
        action: "chapter-propose-scenes",
        chapterId: currentChapter.id,
        workspaceContext: buildChapterWorkspaceAiContext(
          currentChapter,
          planning,
          chapterScenes,
          focusedCharacters.map((character) => ({
            id: character.id,
            name: character.name,
            role: character.role,
          })),
        ),
      });

      setSceneProposalResponse(response);
      setSceneProposalDrafts(
        response.result.sceneProposals.map((proposal) => ({
          ...proposal,
          reviewId: crypto.randomUUID(),
          selected: true,
        })),
      );
    } catch (error) {
      setSceneProposalError(
        error instanceof Error
          ? error.message
          : "NovelForge could not propose scenes for this chapter.",
      );
    } finally {
      setIsGeneratingSceneProposals(false);
    }
  }

  async function handleInsertSceneProposals() {
    if (!sceneProposalResponse || selectedSceneProposalCount === 0) {
      return;
    }

    setIsApplyingSceneProposals(true);
    setSceneProposalError(null);

    try {
      const selectedProposals = sceneProposalDrafts.filter(
        (proposal) => proposal.selected,
      );

      for (const [index, proposal] of selectedProposals.entries()) {
        const draftScene = createEmptySceneInput({
          projectId: currentSnapshot.project.id,
          chapterId: currentChapter.id,
          orderIndex: chapterScenes.length + index,
          title: proposal.title,
        });

        await saveScene({
          ...draftScene,
          summary: proposal.summary,
          purpose: proposal.purpose,
          beatOutline: proposal.beatOutline,
          conflict: proposal.conflict,
          outcome: proposal.outcome,
          povCharacterId: proposal.povCharacterId,
          location: proposal.location,
          timeLabel: proposal.timeLabel,
          involvedCharacterIds: proposal.involvedCharacterIds,
          continuityTags: proposal.continuityTags,
          dependencySceneIds: proposal.dependencySceneIds,
          manuscriptText: proposal.manuscriptText || "<p></p>",
        });
      }

      setSceneProposalMessage(
        `Inserted ${selectedProposals.length} proposed scene${
          selectedProposals.length === 1 ? "" : "s"
        } into this chapter.`,
      );
      setSceneProposalResponse(null);
      setSceneProposalDrafts([]);
    } catch (error) {
      setSceneProposalError(
        error instanceof Error
          ? error.message
          : "NovelForge could not insert the proposed scenes.",
      );
    } finally {
      setIsApplyingSceneProposals(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
      <Panel
        ref={chapterJumpHighlightRef}
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
          title={currentChapter.title}
          description="Plan the chapter above the prose level: define why it exists, what it changes, and how its scenes ladder upward."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate({ to: "/chapters" })}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button
                onClick={() => void handleSaveChapter()}
                disabled={!chapterDirty || !canSave || isSavingWorkspace}
              >
                <Save className="size-4" />
                {isSavingWorkspace
                  ? "Saving..."
                  : chapterDirty
                    ? "Save Chapter"
                    : "Saved"}
              </Button>
            </div>
          }
        />

        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="accent">Chapter {currentChapter.orderIndex + 1}</Badge>
          <Badge>{chapterScenes.length} scene{chapterScenes.length === 1 ? "" : "s"}</Badge>
          {planning.emotionalMovement ? <Badge>{planning.emotionalMovement}</Badge> : null}
          {focusedCharacters.map((character) => (
            <Badge key={character.id}>{character.name}</Badge>
          ))}
        </div>

        <div className="mt-6 grid gap-4">
          <Field label="Title">
            <Input
              value={planning.title}
              onChange={(event) => updatePlanningField("title", event.target.value)}
              placeholder="Chapter title"
            />
          </Field>

          <Field
            label="Chapter Summary"
            hint="What happens here at the chapter level?"
          >
            <Textarea
              className="min-h-28"
              value={planning.summary}
              onChange={(event) => updatePlanningField("summary", event.target.value)}
              placeholder="Summarize the chapter's visible movement."
            />
          </Field>

          <Field
            label="Chapter Purpose"
            hint="Why does this chapter exist in the story?"
          >
            <Textarea
              className="min-h-32"
              value={planning.purpose}
              onChange={(event) => updatePlanningField("purpose", event.target.value)}
              placeholder="Clarify the chapter's structural job."
            />
          </Field>

          <Field label="Emotional Movement">
            <Input
              value={planning.emotionalMovement}
              onChange={(event) =>
                updatePlanningField("emotionalMovement", event.target.value)
              }
              placeholder="Example: suspicion to uneasy alliance"
            />
          </Field>

          <Field label="Major Events" hint="One structural turn per line">
            <Textarea
              className="min-h-32"
              value={planning.majorEvents}
              onChange={(event) =>
                updatePlanningField("majorEvents", event.target.value)
              }
              placeholder={
                "Opening disturbance\nEscalation or reveal\nDecision or irreversible turn"
              }
            />
          </Field>

          <Field label="Character Focus">
            {currentSnapshot.characters.length > 0 ? (
              <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
                {currentSnapshot.characters.map((character) => (
                  <label
                    key={character.id}
                    className="flex items-center gap-2 text-sm text-[var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      checked={planning.characterFocusIds.includes(character.id)}
                      onChange={(event) =>
                        updatePlanningField(
                          "characterFocusIds",
                          event.target.checked
                            ? [...planning.characterFocusIds, character.id]
                            : planning.characterFocusIds.filter((id) => id !== character.id),
                        )
                      }
                    />
                    {character.name}
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No characters yet"
                description="Add characters to tag who this chapter primarily advances."
              />
            )}
          </Field>

          <Field label="Setup / Payoff Notes">
            <Textarea
              className="min-h-28"
              value={planning.setupPayoffNotes}
              onChange={(event) =>
                updatePlanningField("setupPayoffNotes", event.target.value)
              }
              placeholder="Track promises, reversals, and later payoffs seeded here."
            />
          </Field>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <SectionHeading
          title="Scene Plan"
          description="Scenes stay in the authoritative backend order for this chapter. Add new scenes here, then jump into any scene workspace when you need detail."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void handleProposeScenes()}
                disabled={!hasConfiguredAi || isGeneratingSceneProposals}
              >
                {isGeneratingSceneProposals ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                Propose Scenes
              </Button>
              <Button onClick={() => void handleCreateScene()}>
                <Plus className="size-4" />
                Add Scene
              </Button>
            </div>
          }
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <Panel className="bg-white/75 shadow-none">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Target className="size-4" />
              <h3 className="font-semibold">Chapter Intent</h3>
            </div>
            <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
              <div>
                <p className="font-semibold text-[var(--ink)]">Purpose</p>
                <p className="mt-1">{planning.purpose || "Not defined yet."}</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">Summary</p>
                <p className="mt-1">{planning.summary || "No chapter summary yet."}</p>
              </div>
            </div>
          </Panel>

          <Panel className="bg-white/75 shadow-none">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Users className="size-4" />
              <h3 className="font-semibold">Focus Snapshot</h3>
            </div>
            <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
              <div>
                <p className="font-semibold text-[var(--ink)]">Emotional movement</p>
                <p className="mt-1">
                  {planning.emotionalMovement || "Not defined yet."}
                </p>
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">Character focus</p>
                <p className="mt-1">
                  {focusedCharacters.length > 0
                    ? focusedCharacters.map((character) => character.name).join(", ")
                    : "Not defined yet."}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        {!hasConfiguredAi ? (
          <Panel className="mt-6 bg-[color:rgba(194,151,57,0.12)] shadow-none">
            <p className="text-sm text-[var(--warning)]">
              Add a default AI provider and API key in Settings to propose scenes from
              this chapter plan.
            </p>
          </Panel>
        ) : null}

        {sceneProposalError ? (
          <Panel className="mt-6 bg-[color:rgba(174,67,45,0.1)] shadow-none">
            <p className="text-sm text-[var(--danger)]">{sceneProposalError}</p>
          </Panel>
        ) : null}

        {sceneProposalMessage ? (
          <Panel className="mt-6 bg-[color:rgba(32,151,110,0.08)] shadow-none">
            <p className="text-sm text-[color:#0f7350]">{sceneProposalMessage}</p>
          </Panel>
        ) : null}

        {sceneMoveError ? (
          <Panel className="mt-6 bg-[color:rgba(174,67,45,0.1)] shadow-none">
            <p className="text-sm text-[var(--danger)]">{sceneMoveError}</p>
          </Panel>
        ) : null}

        {sceneProposalResponse ? (
          <Panel className="mt-6 bg-white/75 shadow-none">
            <SectionHeading
              title="Scene Proposals"
              description={
                sceneProposalResponse.result.summary ||
                sceneProposalResponse.assistantMessage ||
                "Edit, deselect, or remove proposals before inserting them into the chapter."
              }
              actions={
                <Button
                  variant="secondary"
                  onClick={() => void handleInsertSceneProposals()}
                  disabled={
                    selectedSceneProposalCount === 0 ||
                    hasUntitledSelectedSceneProposal ||
                    isApplyingSceneProposals
                  }
                >
                  {isApplyingSceneProposals ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <CheckSquare className="size-4" />
                  )}
                  Insert Selected
                </Button>
              }
            />

            <div className="mt-4 grid gap-3">
              {hasUntitledSelectedSceneProposal ? (
                <div className="rounded-2xl border border-[color:rgba(174,67,45,0.2)] bg-[color:rgba(174,67,45,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                  Give every selected proposal a title before inserting it.
                </div>
              ) : null}

              {sceneProposalDrafts.length > 0 ? (
                sceneProposalDrafts.map((proposal, index) => {
                  const overlapWarnings = buildProposalOverlapWarnings(
                    proposal,
                    chapterScenes,
                  );

                  return (
                    <div
                      key={proposal.reviewId}
                      className="grid gap-4 rounded-2xl bg-white px-4 py-4 ring-1 ring-black/6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <label className="flex items-center gap-3 text-sm font-semibold text-[var(--ink)]">
                          <input
                            type="checkbox"
                            checked={proposal.selected}
                            onChange={() => toggleSceneProposal(proposal.reviewId)}
                          />
                          Proposal {index + 1}
                        </label>
                        <div className="flex items-center gap-2">
                          {overlapWarnings.length > 0 ? (
                            <Badge tone="warning">
                              {overlapWarnings.some(
                                (warning) => warning.severity === "duplicate",
                              )
                                ? "Potential duplicate"
                                : "Possible overlap"}
                            </Badge>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeSceneProposal(proposal.reviewId)}
                            aria-label={`Remove ${proposal.title || `proposal ${index + 1}`}`}
                          >
                            <Trash2 className="size-4" />
                            Remove
                          </Button>
                        </div>
                      </div>

                      {overlapWarnings.length > 0 ? (
                        <div className="rounded-2xl border border-[color:rgba(194,151,57,0.26)] bg-[color:rgba(194,151,57,0.12)] px-4 py-3">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
                            <div className="grid gap-1 text-sm">
                              <p className="font-semibold text-[var(--warning)]">
                                Check for duplicate or overlapping coverage
                              </p>
                              {overlapWarnings.map((warning) => (
                                <p
                                  key={`${proposal.reviewId}-${warning.sceneId}`}
                                  className="text-[var(--ink-muted)]"
                                >
                                  {warning.reason}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-3 lg:grid-cols-2">
                        <Field label="Scene Title">
                          <Input
                            value={proposal.title}
                            onChange={(event) =>
                              updateSceneProposalDraft(
                                proposal.reviewId,
                                "title",
                                event.target.value,
                              )
                            }
                            placeholder="Name the proposed scene."
                          />
                        </Field>
                        <Field label="Purpose">
                          <Textarea
                            className="min-h-24"
                            value={proposal.purpose}
                            onChange={(event) =>
                              updateSceneProposalDraft(
                                proposal.reviewId,
                                "purpose",
                                event.target.value,
                              )
                            }
                            placeholder="Why does this scene belong in the chapter?"
                          />
                        </Field>
                        <Field label="Summary" className="lg:col-span-2">
                          <Textarea
                            className="min-h-24"
                            value={proposal.summary}
                            onChange={(event) =>
                              updateSceneProposalDraft(
                                proposal.reviewId,
                                "summary",
                                event.target.value,
                              )
                            }
                            placeholder="Summarize the scene's visible movement."
                          />
                        </Field>
                      </div>

                      <div className="grid gap-3 text-sm text-[var(--ink-muted)] lg:grid-cols-2">
                        <div>
                          <p className="font-semibold text-[var(--ink)]">Outcome</p>
                          <p className="mt-1">{proposal.outcome || "Not provided."}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--ink)]">Conflict</p>
                          <p className="mt-1">{proposal.conflict || "Not provided."}</p>
                        </div>
                      </div>
                      {proposal.beatOutline ? (
                        <div>
                          <p className="text-sm font-semibold text-[var(--ink)]">Beat outline</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-muted)]">
                            {proposal.beatOutline}
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {proposal.location ? <Badge>{proposal.location}</Badge> : null}
                        {proposal.timeLabel ? <Badge>{proposal.timeLabel}</Badge> : null}
                        {proposal.povCharacterId ? <Badge>POV linked</Badge> : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  title="No scene proposals left to insert"
                  description="NovelForge returned structured proposals, but they have all been removed from this review pass."
                />
              )}
            </div>
          </Panel>
        ) : null}

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink-muted)]">
            <ListOrdered className="size-4" />
            Scene order comes from the chapter's saved story structure. Move scenes
            earlier, later, or into another chapter without leaving this workspace.
          </div>

          <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1">
            {chapterScenes.length > 0 ? (
              chapterScenes.map((scene, index) => (
                <article
                  key={scene.id}
                  className="rounded-3xl border border-black/8 bg-white/78 p-5 transition hover:border-[color:rgba(184,88,63,0.34)] hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <Badge tone="accent">{index + 1}</Badge>
                        <h3 className="text-base font-semibold text-[var(--ink)]">
                          {scene.title}
                        </h3>
                      </div>
                      <p className="mt-3 text-sm text-[var(--ink-muted)]">
                        {scene.summary || "No scene summary yet."}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3"
                        onClick={() => void handleMoveScene(scene.id, -1)}
                        disabled={index === 0 || Boolean(movingSceneId)}
                        aria-label={`Move ${scene.title} earlier`}
                      >
                        <ArrowUp className="size-4" />
                        Earlier
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3"
                        onClick={() => void handleMoveScene(scene.id, 1)}
                        disabled={
                          index === chapterScenes.length - 1 || Boolean(movingSceneId)
                        }
                        aria-label={`Move ${scene.title} later`}
                      >
                        <ArrowDown className="size-4" />
                        Later
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3"
                        onClick={() => handleStartCrossChapterMove(scene.id)}
                        disabled={otherChapters.length === 0 || Boolean(movingSceneId)}
                        aria-label={`Move ${scene.title} to another chapter`}
                      >
                        Move to Chapter...
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3"
                        onClick={() =>
                          void navigate({
                            to: "/scenes/$sceneId",
                            params: { sceneId: scene.id },
                          })
                        }
                        aria-label={`Open ${scene.title}`}
                      >
                        <FileText className="size-4" />
                        Open
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-[var(--ink-muted)] lg:grid-cols-2">
                    <div>
                      <p className="font-semibold text-[var(--ink)]">Scene purpose</p>
                      <p className="mt-1">{scene.purpose || "Not defined yet."}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--ink)]">Scene footing</p>
                      <p className="mt-1">
                        {[scene.location, scene.timeLabel].filter(Boolean).join(" · ") ||
                          "Location and time not set."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {scene.outcome ? <Badge>{scene.outcome}</Badge> : null}
                    {scene.povCharacterId ? (
                      <Badge>
                        POV{" "}
                        {currentSnapshot.characters.find(
                          (character) => character.id === scene.povCharacterId,
                        )?.name ?? "Character"}
                      </Badge>
                    ) : null}
                    {scene.dependencySceneIds.length > 0 ? (
                      <Badge>{scene.dependencySceneIds.length} dependency link{scene.dependencySceneIds.length === 1 ? "" : "s"}</Badge>
                    ) : null}
                  </div>
                  {sceneMoveDraft?.sceneId === scene.id ? (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-black/8 bg-[color:rgba(184,88,63,0.06)] px-4 py-4">
                      <Field label="Move to Chapter">
                        <Select
                          value={sceneMoveDraft.targetChapterId}
                          onChange={(event) =>
                            setSceneMoveDraft((currentDraft) =>
                              currentDraft?.sceneId === scene.id
                                ? buildSceneMoveDraft(
                                    scene.id,
                                    event.target.value,
                                    currentDraft.placement,
                                    currentDraft.anchorSceneId,
                                  )
                                : currentDraft,
                            )
                          }
                        >
                          {otherChapters.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.title}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Insert Position">
                        <Select
                          value={sceneMoveDraft.placement}
                          onChange={(event) =>
                            setSceneMoveDraft((currentDraft) =>
                              currentDraft?.sceneId === scene.id
                                ? buildSceneMoveDraft(
                                    scene.id,
                                    currentDraft.targetChapterId,
                                    event.target.value as ChapterSceneMoveDraft["placement"],
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
                              <option value="before">Before selected scene</option>
                              <option value="after">After selected scene</option>
                            </>
                          ) : null}
                        </Select>
                      </Field>
                      {sceneMoveDraft.placement === "before" ||
                      sceneMoveDraft.placement === "after" ? (
                        <Field
                          label={
                            sceneMoveDraft.placement === "before"
                              ? "Before Scene"
                              : "After Scene"
                          }
                        >
                          <Select
                            value={sceneMoveDraft.anchorSceneId}
                            onChange={(event) =>
                              setSceneMoveDraft((currentDraft) =>
                                currentDraft?.sceneId === scene.id
                                  ? {
                                      ...currentDraft,
                                      anchorSceneId: event.target.value,
                                    }
                                  : currentDraft,
                              )
                            }
                          >
                            {targetChapterScenes.map((candidate, targetIndex) => (
                              <option key={candidate.id} value={candidate.id}>
                                {targetIndex + 1}. {candidate.title}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ) : null}
                      <p className="text-sm text-[var(--ink-muted)]">
                        {sceneMoveDraft.placement === "start"
                          ? `The scene will be inserted at the beginning of ${
                              targetChapter?.title ?? "the selected chapter"
                            } using the saved backend order.`
                          : sceneMoveDraft.placement === "end"
                            ? `The scene will be inserted at the end of ${
                                targetChapter?.title ?? "the selected chapter"
                              } using the saved backend order.`
                            : sceneMoveDraft.placement === "before"
                              ? `The scene will be inserted before ${
                                  sceneMoveAnchor?.title ?? "the selected scene"
                                } in ${
                                  targetChapter?.title ?? "the selected chapter"
                                } using the saved backend order.`
                              : `The scene will be inserted after ${
                                  sceneMoveAnchor?.title ?? "the selected scene"
                                } in ${
                                  targetChapter?.title ?? "the selected chapter"
                                } using the saved backend order.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleCancelCrossChapterMove}
                          disabled={movingSceneId === scene.id}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleMoveSceneToChapter(scene.id)}
                          disabled={movingSceneId === scene.id}
                        >
                          Move Scene
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {movingSceneId === scene.id ? (
                    <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                      Updating order...
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                title="No scenes in this chapter yet"
                description="Create the first scene here to start turning chapter intent into scene-level structure."
                action={
                  <Button onClick={() => void handleCreateScene()}>
                    <Plus className="size-4" />
                    Create First Scene
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
