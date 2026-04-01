import { useNavigate } from "@tanstack/react-router";
import type { Chapter, ProjectSnapshot, Scene } from "@novelforge/domain";
import { ChevronRight } from "lucide-react";
import { Badge, Button, EmptyState, Panel, SectionHeading } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useUiStore } from "@/store/uiStore";

interface StructuralWarning {
  label: string;
  tone: "warning" | "danger";
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

function getChapterStructuralWarnings(chapter: Chapter, sceneCount: number): StructuralWarning[] {
  const warnings: StructuralWarning[] = [];

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

export function StoryOverviewView() {
  const navigate = useNavigate();
  const snapshotQuery = useProjectSnapshot();
  const searchText = useUiStore((state) => state.searchText);
  const setSelectedChapterId = useUiStore((state) => state.setSelectedChapterId);
  const snapshot = snapshotQuery.data;

  if (!snapshot) {
    return null;
  }

  const orderedChapters = buildOrderedChapters(snapshot);
  const chapterScenes = buildChapterSceneMap(snapshot);
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredChapters = orderedChapters.filter((chapter) => {
    if (!normalizedSearchText) {
      return true;
    }

    return buildChapterSearchText(chapter, chapterScenes[chapter.id] ?? []).includes(
      normalizedSearchText,
    );
  });
  const mappedSceneCount = snapshot.scenes.filter((scene) => scene.chapterId !== null).length;
  const unassignedSceneCount = snapshot.scenes.filter((scene) => scene.chapterId === null).length;
  const chaptersNeedingAttentionCount = orderedChapters.filter((chapter) => {
    return getChapterStructuralWarnings(chapter, chapterScenes[chapter.id]?.length ?? 0).length > 0;
  }).length;

  return (
    <Panel className="h-full min-h-0">
      <SectionHeading
        title="Story Spine"
        description="Scan the full story in chapter order, spot obvious structural gaps, and jump straight into chapter or scene workspaces when something needs attention."
        actions={
          <Button variant="secondary" onClick={() => void navigate({ to: "/chapters" })}>
            Open Chapters Board
          </Button>
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
            Missing purpose, summary, or scene coverage.
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

      <div className="mt-6 grid gap-4">
        {filteredChapters.length === 0 ? (
          <EmptyState
            title={normalizedSearchText ? "No chapters match this filter" : "No chapters yet"}
            description={
              normalizedSearchText
                ? "Try a different quick filter to bring chapters and scenes back into view."
                : "Create the first chapter on the chapters board to start shaping the full story."
            }
            action={
              <Button variant="secondary" onClick={() => void navigate({ to: "/chapters" })}>
                Open Chapters Board
              </Button>
            }
          />
        ) : (
          filteredChapters.map((chapter) => {
            const scenes = chapterScenes[chapter.id] ?? [];
            const warnings = getChapterStructuralWarnings(chapter, scenes.length);

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

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">
                      {scenes.length} scene{scenes.length === 1 ? "" : "s"}
                    </Badge>
                    {warnings.map((warning) => (
                      <Badge key={`${chapter.id}-${warning.label}`} tone={warning.tone}>
                        {warning.label}
                      </Badge>
                    ))}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedChapterId(chapter.id);
                        void navigate({
                          to: "/chapters/$chapterId",
                          params: { chapterId: chapter.id },
                        });
                      }}
                    >
                      Open Chapter Workspace
                    </Button>
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
