import { useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import type { Chapter } from "@novelforge/domain";
import { BookOpen, ChevronRight, GripVertical, Plus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, EmptyState, Panel, SectionHeading } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { createId } from "@/lib/ids";
import { useUiStore } from "@/store/uiStore";

function SortableChapterRow({
  chapter,
  isSelected,
  sceneCount,
  onOpen,
}: {
  chapter: Chapter;
  isSelected: boolean;
  sceneCount: number;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: chapter.id,
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-3 border-l-2 px-3 py-3 transition ${
        isSelected
          ? "border-[var(--accent)] bg-[var(--selected)]"
          : "border-transparent hover:bg-[var(--hover)]"
      } ${isDragging ? "bg-[var(--surface-raised)]" : ""}`}
    >
      <button
        className="min-w-0 flex-1 rounded-[4px] px-1 py-1 text-left"
        onClick={onOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-[var(--ink)]">
              {chapter.title}
            </h3>
            <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
              {chapter.summary || "No summary yet."}
            </p>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--ink-faint)]" />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="accent">
            {sceneCount} scene{sceneCount === 1 ? "" : "s"}
          </Badge>
          {chapter.emotionalMovement ? <Badge>{chapter.emotionalMovement}</Badge> : null}
          {chapter.majorEvents.slice(0, 1).map((event) => (
            <Badge key={event}>{event}</Badge>
          ))}
        </div>
      </button>

      <button
        type="button"
        className="mt-1 shrink-0 rounded-[4px] p-2 text-[var(--ink-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        aria-label={`Reorder ${chapter.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
}

export function ChaptersView() {
  const navigate = useNavigate();
  const snapshotQuery = useProjectSnapshot();
  const { reorderChapters, saveChapter } = useProjectRuntime();
  const [selectedChapterId, setSelectedChapterId, searchText] = useUiStore(
    useShallow((state) => [
      state.selectedChapterId,
      state.setSelectedChapterId,
      state.searchText,
    ]),
  );
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  const snapshot = snapshotQuery.data;
  if (!snapshot) {
    return null;
  }

  const currentSnapshot = snapshot;
  const chapters = [...currentSnapshot.chapters]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((chapter) =>
      [chapter.title, chapter.summary, chapter.purpose]
        .join(" ")
        .toLowerCase()
        .includes(searchText.toLowerCase()),
    );
  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null;
  const chapterSceneCounts = currentSnapshot.scenes.reduce<Record<string, number>>(
    (counts, scene) => {
      if (scene.chapterId) {
        counts[scene.chapterId] = (counts[scene.chapterId] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );

  useEffect(() => {
    if (!selectedChapterId && chapters[0]) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  async function handleAddChapter() {
    const nextIndex =
      currentSnapshot.chapters.reduce(
        (max, chapter) => Math.max(max, chapter.orderIndex),
        -1,
      ) + 1;

    const newChapter = {
      id: createId("chapter"),
      projectId: currentSnapshot.project.id,
      title: `Chapter ${currentSnapshot.chapters.length + 1}`,
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
    await navigate({
      to: "/chapters/$chapterId",
      params: { chapterId: newChapter.id },
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) {
      return;
    }

    const currentIds = chapters.map((chapter) => chapter.id);
    const oldIndex = currentIds.indexOf(String(event.active.id));
    const newIndex = currentIds.indexOf(String(event.over.id));
    const reordered = arrayMove(currentIds, oldIndex, newIndex);
    await reorderChapters(currentSnapshot.project.id, reordered);
  }

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.8fr)]">
      <Panel className="min-h-0">
        <SectionHeading
          title="Chapters"
          description="Reorder the story spine here, then open any chapter workspace to plan its purpose, summary, and scene composition."
          actions={
            <Button onClick={() => void handleAddChapter()}>
              <Plus className="size-4" />
              Add Chapter
            </Button>
          }
        />

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          {chapters.length === 0 ? (
            <EmptyState
              title="No chapters yet"
              description="Create the first chapter to start building the story spine."
              action={
                <Button onClick={() => void handleAddChapter()}>
                  Create Chapter
                </Button>
              }
            />
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={chapters.map((chapter) => chapter.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid gap-1">
                  {chapters.map((chapter) => (
                    <SortableChapterRow
                      key={chapter.id}
                      chapter={chapter}
                      isSelected={selectedChapter?.id === chapter.id}
                      sceneCount={chapterSceneCounts[chapter.id] ?? 0}
                      onOpen={() => {
                        setSelectedChapterId(chapter.id);
                        void navigate({
                          to: "/chapters/$chapterId",
                          params: { chapterId: chapter.id },
                        });
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </Panel>

      <Panel className="h-full">
        <SectionHeading
          title={selectedChapter ? selectedChapter.title : "Chapter Planning"}
          description="Use chapter workspaces as the planning layer above scenes so structure stays visible before prose takes over."
        />

        <div className="mt-5 grid gap-3 border-t border-[var(--border)] pt-4">
          {selectedChapter ? (
            <>
              <Panel className="bg-[var(--surface-elevated)] p-3 shadow-none">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <BookOpen className="size-4" />
                  <h3 className="text-[13px] font-semibold">Selected Chapter</h3>
                </div>
                <div className="mt-3 grid gap-3 text-[13px] text-[var(--ink-muted)]">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">Summary</p>
                    <p className="mt-1">
                      {selectedChapter.summary || "No summary yet."}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--ink)]">Purpose</p>
                    <p className="mt-1">
                      {selectedChapter.purpose || "Not defined yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="accent">
                      {chapterSceneCounts[selectedChapter.id] ?? 0} scene
                      {(chapterSceneCounts[selectedChapter.id] ?? 0) === 1 ? "" : "s"}
                    </Badge>
                    {selectedChapter.emotionalMovement ? (
                      <Badge>{selectedChapter.emotionalMovement}</Badge>
                    ) : null}
                  </div>
                </div>
              </Panel>

              <Button
                onClick={() =>
                  void navigate({
                    to: "/chapters/$chapterId",
                    params: { chapterId: selectedChapter.id },
                  })
                }
              >
                <ChevronRight className="size-4" />
                Open Chapter Workspace
              </Button>
            </>
          ) : (
            <EmptyState
              title="Open a chapter workspace"
              description="Choose a chapter from the story spine to plan its summary, purpose, and ordered scenes."
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
