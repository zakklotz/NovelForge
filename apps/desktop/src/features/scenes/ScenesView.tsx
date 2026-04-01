import { Plus } from "lucide-react";
import { Button, Panel, SectionHeading } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { createId } from "@/lib/ids";
import { SceneBoard } from "./SceneBoard";
import { useUiStore } from "@/store/uiStore";

export function ScenesView() {
  const snapshotQuery = useProjectSnapshot();
  const { moveScene, saveScene } = useProjectRuntime();
  const searchText = useUiStore((state) => state.searchText);
  const snapshot = snapshotQuery.data;

  if (!snapshot) {
    return null;
  }

  const currentSnapshot = snapshot;

  async function handleCreateScene(chapterId: string | null) {
    const nextIndex =
      currentSnapshot.scenes
        .filter((scene) => (scene.chapterId ?? null) === chapterId)
        .reduce((max, scene) => Math.max(max, scene.orderIndex), -1) + 1;

    await saveScene({
      id: createId("scene"),
      projectId: currentSnapshot.project.id,
      chapterId,
      orderIndex: nextIndex,
      title: `Scene ${currentSnapshot.scenes.length + 1}`,
      summary: "",
      purpose: "",
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
    <Panel className="h-full min-h-0">
      <SectionHeading
        title="Scenes"
        description="Move scenes across chapters without losing the structural context that makes them work."
        actions={
          <Button onClick={() => handleCreateScene(null)}>
            <Plus className="size-4" />
            Add Unassigned Scene
          </Button>
        }
      />
      <div className="mt-6">
        <SceneBoard
          snapshot={snapshot}
          searchText={searchText}
          onCreateScene={handleCreateScene}
          onMoveScene={(input) =>
            moveScene(input, {
              id: crypto.randomUUID(),
              projectId: currentSnapshot.project.id,
              occurredAt: new Date().toISOString(),
              type: "scene.moved",
              sceneId: input.sceneId,
              fromChapterId:
                currentSnapshot.scenes.find((scene) => scene.id === input.sceneId)?.chapterId ??
                null,
              toChapterId: input.targetChapterId,
            })
          }
        />
      </div>
    </Panel>
  );
}
