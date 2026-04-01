import type { SaveSceneInput } from "@novelforge/domain";
import { createId } from "@/lib/ids";

interface CreateEmptySceneInputOptions {
  projectId: string;
  chapterId: string | null;
  orderIndex: number;
  title: string;
}

export function createEmptySceneInput({
  projectId,
  chapterId,
  orderIndex,
  title,
}: CreateEmptySceneInputOptions): SaveSceneInput {
  return {
    id: createId("scene"),
    projectId,
    chapterId,
    orderIndex,
    title,
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
  };
}
