import { useEffect, useState } from "react";
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
import { ChevronRight, Plus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, EmptyState, Field, Panel, SectionHeading, Textarea, Input } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { createId } from "@/lib/ids";
import { splitLines } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";

function SortableChapterRow({
  chapter,
  isSelected,
  onSelect,
  onOpen,
}: {
  chapter: Chapter;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: chapter.id,
  });

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
        isSelected
          ? "border-[color:rgba(184,88,63,0.34)] bg-[color:rgba(184,88,63,0.08)]"
          : "border-black/8 bg-white/70 hover:border-black/15 hover:bg-white"
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">
            {chapter.title}
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {chapter.summary || "No summary yet."}
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 text-[var(--ink-faint)]" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chapter.emotionalMovement ? (
          <Badge tone="accent">{chapter.emotionalMovement}</Badge>
        ) : null}
        {chapter.majorEvents.slice(0, 2).map((event) => (
          <Badge key={event}>{event}</Badge>
        ))}
      </div>
    </button>
  );
}

function ChapterInspector({
  chapter,
}: {
  chapter: Chapter;
}) {
  const { saveChapter } = useProjectRuntime();
  const snapshotQuery = useProjectSnapshot();
  const [title, setTitle] = useState(chapter.title);
  const [summary, setSummary] = useState(chapter.summary);
  const [purpose, setPurpose] = useState(chapter.purpose);
  const [majorEvents, setMajorEvents] = useState(chapter.majorEvents.join("\n"));
  const [emotionalMovement, setEmotionalMovement] = useState(chapter.emotionalMovement);
  const [setupPayoffNotes, setSetupPayoffNotes] = useState(chapter.setupPayoffNotes);
  const [characterFocusIds, setCharacterFocusIds] = useState<string[]>(chapter.characterFocusIds);

  useEffect(() => {
    setTitle(chapter.title);
    setSummary(chapter.summary);
    setPurpose(chapter.purpose);
    setMajorEvents(chapter.majorEvents.join("\n"));
    setEmotionalMovement(chapter.emotionalMovement);
    setSetupPayoffNotes(chapter.setupPayoffNotes);
    setCharacterFocusIds(chapter.characterFocusIds);
  }, [chapter]);

  const characters = snapshotQuery.data?.characters ?? [];

  async function handleSave() {
    await saveChapter(
      {
        ...chapter,
        title,
        summary,
        purpose,
        majorEvents: splitLines(majorEvents),
        emotionalMovement,
        setupPayoffNotes,
        characterFocusIds,
      },
      {
        id: crypto.randomUUID(),
        projectId: chapter.projectId,
        occurredAt: new Date().toISOString(),
        type: "chapter.updated",
        chapterId: chapter.id,
        changedFields: ["summary", "purpose", "majorEvents", "emotionalMovement"],
      },
    );
  }

  return (
    <Panel className="h-full">
      <SectionHeading
        title="Chapter Inspector"
        description="Keep the chapter’s structural intent visible while you reorganize scenes."
        actions={<Button onClick={handleSave}>Save Chapter</Button>}
      />
      <div className="mt-6 grid gap-4">
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Summary">
          <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        <Field label="Purpose">
          <Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} />
        </Field>
        <Field label="Major Events" hint="One per line">
          <Textarea
            value={majorEvents}
            onChange={(event) => setMajorEvents(event.target.value)}
          />
        </Field>
        <Field label="Emotional Movement">
          <Input
            value={emotionalMovement}
            onChange={(event) => setEmotionalMovement(event.target.value)}
          />
        </Field>
        <Field label="Character Focus">
          <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
            {characters.map((character) => (
              <label key={character.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={characterFocusIds.includes(character.id)}
                  onChange={(event) =>
                    setCharacterFocusIds((current) =>
                      event.target.checked
                        ? [...current, character.id]
                        : current.filter((value) => value !== character.id),
                    )
                  }
                />
                {character.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Setup / Payoff Notes">
          <Textarea
            value={setupPayoffNotes}
            onChange={(event) => setSetupPayoffNotes(event.target.value)}
          />
        </Field>
      </div>
    </Panel>
  );
}

export function ChaptersView() {
  const navigate = useNavigate();
  const snapshotQuery = useProjectSnapshot();
  const { reorderChapters, saveChapter } = useProjectRuntime();
  const [selectedChapterId, setSelectedChapterId, searchText] = useUiStore(useShallow((state) => [
    state.selectedChapterId,
    state.setSelectedChapterId,
    state.searchText,
  ]));
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
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0];

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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveChapter(newChapter);
    setSelectedChapterId(newChapter.id);
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
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.85fr)]">
      <Panel className="min-h-0">
        <SectionHeading
          title="Chapters"
          description="Reorder the novel’s major structural units and keep each chapter’s job explicit."
          actions={
            <Button onClick={handleAddChapter}>
              <Plus className="size-4" />
              Add Chapter
            </Button>
          }
        />
        <div className="mt-6">
          {chapters.length === 0 ? (
            <EmptyState
              title="No chapters yet"
              description="Create the first chapter to start building the story spine."
              action={<Button onClick={handleAddChapter}>Create Chapter</Button>}
            />
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={chapters.map((chapter) => chapter.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid gap-3">
                  {chapters.map((chapter) => (
                    <SortableChapterRow
                      key={chapter.id}
                      chapter={chapter}
                      isSelected={selectedChapter?.id === chapter.id}
                      onSelect={() => setSelectedChapterId(chapter.id)}
                      onOpen={() =>
                        navigate({
                          to: "/chapters/$chapterId",
                          params: { chapterId: chapter.id },
                        })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </Panel>

      {selectedChapter ? (
        <ChapterInspector chapter={selectedChapter} />
      ) : (
        <Panel>
          <EmptyState
            title="Choose a chapter"
            description="Select a chapter to edit its purpose, emotional movement, and major events."
          />
        </Panel>
      )}
    </div>
  );
}
