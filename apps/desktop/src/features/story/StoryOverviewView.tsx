import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  Chapter,
  DomainObjectRef,
  ProjectSnapshot,
  Scene,
  StoryStructureDiagnostic,
  StructuredAiResponse,
} from "@novelforge/domain";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  RefreshCw,
  WandSparkles,
} from "lucide-react";
import { Badge, Button, EmptyState, Panel, SectionHeading } from "@/components/ui";
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
      return `Chapter ${chapter.orderIndex + 1}: ${chapter.title}`;
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

export function StoryOverviewView() {
  const navigate = useNavigate();
  const snapshotQuery = useProjectSnapshot();
  const appSettingsQuery = useAppSettings();
  const { runStructuredAiAction } = useAiRuntime();
  const { reorderChapters, saveChapter } = useProjectRuntime();
  const searchText = useUiStore((state) => state.searchText);
  const setSelectedChapterId = useUiStore((state) => state.setSelectedChapterId);
  const snapshot = snapshotQuery.data;
  const appSettings = appSettingsQuery.data;
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [movingChapterId, setMovingChapterId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [storyDiagnosticResponse, setStoryDiagnosticResponse] =
    useState<StructuredAiResponse | null>(null);
  const [isAnalyzingStory, setIsAnalyzingStory] = useState(false);
  const [storyDiagnosticError, setStoryDiagnosticError] = useState<string | null>(null);

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
  const storyDiagnosticEntryCount = storyDiagnosticSections.reduce(
    (count, section) =>
      count +
      (storyDiagnosticResponse?.result.storyStructureDiagnostic[section.key].length ?? 0),
    0,
  );
  const isMutatingStructure = isAddingChapter || movingChapterId !== null;

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

  return (
    <Panel className="h-full min-h-0">
      <SectionHeading
        title="Story Spine"
        description="Scan the full story in chapter order, spot obvious structural gaps, and jump straight into chapter or scene workspaces when something needs attention."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => void handleAnalyzeStoryStructure()}
              disabled={!hasConfiguredAi || isMutatingStructure || isAnalyzingStory}
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
              {storyDiagnosticEntryCount} structural note
              {storyDiagnosticEntryCount === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {storyDiagnosticSections.map((section) => {
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

                        return (
                          <div
                            key={`${section.key}-${entry.title}-${index}`}
                            className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/6"
                          >
                            <p className="text-sm font-semibold text-[var(--ink)]">
                              {entry.title}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                              {entry.detail ||
                                "Review this area in the existing chapter and scene workspaces."}
                            </p>

                            {entry.focus || relatedReferences.length > 0 ? (
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
