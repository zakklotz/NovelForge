import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MoveSceneInput, ProjectSnapshot, Scene } from "@novelforge/domain";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, UserRound } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

interface SceneBoardProps {
  snapshot: ProjectSnapshot;
  searchText: string;
  onMoveScene: (input: MoveSceneInput) => Promise<unknown>;
  onCreateScene: (chapterId: string | null) => Promise<void>;
}

interface SceneColumnModel {
  id: string;
  title: string;
  chapterId: string | null;
  scenes: Scene[];
}

function SortableSceneCard({
  scene,
  chapterId,
}: {
  scene: Scene;
  chapterId: string | null;
}) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: scene.id,
      data: { type: "scene", sceneId: scene.id, chapterId },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group cursor-grab rounded-2xl border border-black/8 bg-white/90 p-4 shadow-sm transition hover:border-[color:rgba(184,88,63,0.3)] hover:shadow-md",
        isDragging && "opacity-60",
      )}
      onDoubleClick={() =>
        navigate({ to: "/scenes/$sceneId", params: { sceneId: scene.id } })
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">
            {scene.title}
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {scene.summary || "No summary yet."}
          </p>
        </div>
        <ArrowRight className="mt-1 size-4 text-[var(--ink-faint)] transition group-hover:text-[var(--accent)]" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {scene.povCharacterId ? (
          <Badge tone="accent">
            <UserRound className="mr-1 size-3" />
            POV set
          </Badge>
        ) : null}
        {scene.timeLabel ? <Badge>{scene.timeLabel}</Badge> : null}
        {scene.continuityTags.slice(0, 2).map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        Double-click to open workspace
      </p>
    </article>
  );
}

function SceneColumn({
  column,
  onCreateScene,
}: {
  column: SceneColumnModel;
  onCreateScene: (chapterId: string | null) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "scene-column", chapterId: column.chapterId },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-[14rem] flex-col gap-4 rounded-[2rem] border border-white/65 bg-[var(--panel)] p-5 shadow-[0_20px_50px_rgba(38,27,16,0.08)] transition",
        isOver && "border-[color:rgba(184,88,63,0.45)] bg-white/90",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">
            {column.title}
          </h3>
          <p className="text-sm text-[var(--ink-muted)]">
            {column.scenes.length} scene{column.scenes.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant="ghost"
          className="px-3"
          onClick={() => onCreateScene(column.chapterId)}
        >
          <Plus className="size-4" />
          Add scene
        </Button>
      </div>

      <SortableContext
        items={column.scenes.map((scene) => scene.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid gap-3">
          {column.scenes.length > 0 ? (
            column.scenes.map((scene) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                chapterId={column.chapterId}
              />
            ))
          ) : (
            <EmptyState
              title="No scenes yet"
              description="Drop a scene here or create one directly in this chapter lane."
            />
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function buildColumns(snapshot: ProjectSnapshot, searchText: string) {
  const chapterOrder = [...snapshot.chapters].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const normalizedSearch = searchText.trim().toLowerCase();
  const matchesSearch = (scene: Scene) =>
    normalizedSearch.length === 0 ||
    [scene.title, scene.summary, scene.location, scene.timeLabel]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);

  const groupedByChapter = new Map<string | null, Scene[]>();
  for (const scene of snapshot.scenes) {
    const bucket = groupedByChapter.get(scene.chapterId ?? null) ?? [];
    if (matchesSearch(scene)) {
      bucket.push(scene);
    }
    groupedByChapter.set(scene.chapterId ?? null, bucket);
  }

  const columns: SceneColumnModel[] = chapterOrder.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    chapterId: chapter.id,
    scenes: [...(groupedByChapter.get(chapter.id) ?? [])].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    ),
  }));

  columns.push({
    id: "unassigned",
    title: "Unassigned Scenes",
    chapterId: null,
    scenes: [...(groupedByChapter.get(null) ?? [])].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    ),
  });

  return columns;
}

export function SceneBoard({
  snapshot,
  searchText,
  onMoveScene,
  onCreateScene,
}: SceneBoardProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  const columns = buildColumns(snapshot, searchText);

  async function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    setActiveSceneId(null);

    if (!overData || activeData?.type !== "scene") {
      return;
    }

    const activeScene = snapshot.scenes.find((scene) => scene.id === event.active.id);
    if (!activeScene) {
      return;
    }

    let targetChapterId: string | null = null;
    let targetIndex = 0;

    if (overData.type === "scene") {
      const overScene = snapshot.scenes.find((scene) => scene.id === event.over?.id);
      if (!overScene) {
        return;
      }

      targetChapterId = overScene.chapterId ?? null;
      const targetScenes = snapshot.scenes
        .filter((scene) => (scene.chapterId ?? null) === targetChapterId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      targetIndex = targetScenes.findIndex((scene) => scene.id === overScene.id);
    } else if (overData.type === "scene-column") {
      targetChapterId = overData.chapterId ?? null;
      targetIndex = snapshot.scenes.filter(
        (scene) => (scene.chapterId ?? null) === targetChapterId,
      ).length;
    } else {
      return;
    }

    if (
      activeScene.chapterId === targetChapterId &&
      activeScene.orderIndex === targetIndex
    ) {
      return;
    }

    await onMoveScene({
      projectId: snapshot.project.id,
      sceneId: activeScene.id,
      targetChapterId,
      targetIndex,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => setActiveSceneId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveSceneId(null)}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <SceneColumn
            key={column.id}
            column={column}
            onCreateScene={onCreateScene}
          />
        ))}
      </div>

      {activeSceneId ? (
        <div className="pointer-events-none fixed bottom-6 right-6 rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white shadow-lg">
          Moving {snapshot.scenes.find((scene) => scene.id === activeSceneId)?.title}
        </div>
      ) : null}
    </DndContext>
  );
}
