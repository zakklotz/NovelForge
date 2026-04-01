import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRightLeft, Plus } from "lucide-react";
import { Badge, Button, EmptyState, Panel, SectionHeading } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { createId } from "@/lib/ids";

export function ChapterDetailView() {
  const navigate = useNavigate();
  const { chapterId } = useParams({ from: "/chapters/$chapterId" });
  const snapshotQuery = useProjectSnapshot();
  const { moveScene, saveScene } = useProjectRuntime();

  const snapshot = snapshotQuery.data;
  if (!snapshot) {
    return null;
  }

  const chapter = snapshot.chapters.find((item) => item.id === chapterId);
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

  const chapterScenes = currentSnapshot.scenes
    .filter((scene) => scene.chapterId === currentChapter.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const otherScenes = currentSnapshot.scenes
    .filter((scene) => scene.chapterId !== currentChapter.id)
    .sort((a, b) => a.title.localeCompare(b.title));

  async function handleCreateScene() {
    const nextIndex =
      chapterScenes.reduce((max, scene) => Math.max(max, scene.orderIndex), -1) + 1;
    await saveScene({
      id: createId("scene"),
      projectId: currentSnapshot.project.id,
      chapterId: currentChapter.id,
      orderIndex: nextIndex,
      title: `Scene ${chapterScenes.length + 1}`,
      summary: "",
      purpose: "",
      beatOutline: "",
      conflict: "",
      outcome: "",
      povCharacterId: null,
      location: "",
      timeLabel: "",
      involvedCharacterIds: [],
      continuityTags: [],
      dependencySceneIds: [],
      manuscriptText: "<p></p>",
    });
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <Panel className="min-h-0">
        <SectionHeading
          title={chapter.title}
          description={chapter.summary || "This chapter has not been summarized yet."}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate({ to: "/chapters" })}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={handleCreateScene}>
                <Plus className="size-4" />
                Add Scene
              </Button>
            </div>
          }
        />
        <div className="mt-6 grid gap-3">
          {chapterScenes.length > 0 ? (
            chapterScenes.map((scene) => (
              <button
                key={scene.id}
                className="rounded-2xl border border-black/8 bg-white/80 p-4 text-left transition hover:border-[color:rgba(184,88,63,0.34)] hover:bg-white"
                onDoubleClick={() =>
                  navigate({
                    to: "/scenes/$sceneId",
                    params: { sceneId: scene.id },
                  })
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
                  <Badge tone="accent">{scene.orderIndex + 1}</Badge>
                </div>
              </button>
            ))
          ) : (
            <EmptyState
              title="No scenes in this chapter"
              description="Create one here, or move scenes in from elsewhere."
            />
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Bring Scenes In"
          description="Pull scenes from other chapters or the unassigned pool into this chapter."
        />
        <div className="mt-6 grid gap-3">
          {otherScenes.length > 0 ? (
            otherScenes.map((scene) => (
              <div
                key={scene.id}
                className="rounded-2xl border border-black/8 bg-white/75 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--ink)]">{scene.title}</h3>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">
                      {scene.summary || "No summary yet."}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() =>
                      moveScene(
                        {
                          projectId: currentSnapshot.project.id,
                          sceneId: scene.id,
                          targetChapterId: currentChapter.id,
                          targetIndex: chapterScenes.length,
                        },
                        {
                          id: crypto.randomUUID(),
                          projectId: currentSnapshot.project.id,
                          occurredAt: new Date().toISOString(),
                          type: "scene.moved",
                          sceneId: scene.id,
                          fromChapterId: scene.chapterId,
                          toChapterId: currentChapter.id,
                        },
                      )
                    }
                  >
                    <ArrowRightLeft className="size-4" />
                    Move In
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Everything is already here"
              description="All current scenes are assigned to this chapter."
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
