import { useQueryClient } from "@tanstack/react-query";
import type {
  Chapter,
  Character,
  CreateProjectInput,
  DomainEvent,
  MoveSceneInput,
  OpenProjectInput,
  ProjectSnapshot,
  ProjectState,
  SaveChapterInput,
  SaveCharacterInput,
  SaveManuscriptInput,
  SaveSceneInput,
  Scene,
  UpdateSuggestionStatusInput,
} from "@novelforge/domain";
import { tauriApi } from "@/lib/tauri";
import { useUiStore } from "@/store/uiStore";

export function useProjectRuntime() {
  const queryClient = useQueryClient();
  const setCurrentProjectId = useUiStore((state) => state.setCurrentProjectId);
  const enqueueAnalysis = useUiStore((state) => state.enqueueAnalysis);
  const resetUi = useUiStore((state) => state.resetUi);

  async function setSnapshot(snapshot: ProjectSnapshot) {
    if (useUiStore.getState().currentProjectId !== snapshot.project.id) {
      setCurrentProjectId(snapshot.project.id);
    }
    queryClient.setQueryData(["projectSnapshot", snapshot.project.id], snapshot);
    return snapshot;
  }

  async function refreshSnapshot() {
    const snapshot = await tauriApi.getProjectSnapshot();
    await setSnapshot(snapshot);
    return snapshot;
  }

  async function restoreLastProject() {
    const snapshot = await tauriApi.restoreLastProject();
    if (!snapshot) {
      return null;
    }

    resetUi();
    return setSnapshot(snapshot);
  }

  async function createProject(input: CreateProjectInput) {
    const snapshot = await tauriApi.createProject(input);
    resetUi();
    return setSnapshot(snapshot);
  }

  async function openProject(input: OpenProjectInput) {
    const snapshot = await tauriApi.openProject(input);
    resetUi();
    return setSnapshot(snapshot);
  }

  async function saveChapter(input: SaveChapterInput, event?: DomainEvent) {
    const chapter = await tauriApi.saveChapter(input);
    await refreshSnapshot();
    if (event) {
      enqueueAnalysis(event);
    }
    return chapter as Chapter;
  }

  async function reorderChapters(projectId: string, chapterIds: string[]) {
    await tauriApi.reorderChapters(projectId, chapterIds);
    return refreshSnapshot();
  }

  async function saveScene(input: SaveSceneInput, event?: DomainEvent) {
    const scene = await tauriApi.saveScene(input);
    await refreshSnapshot();
    if (event) {
      enqueueAnalysis(event);
    }
    return scene as Scene;
  }

  async function moveScene(input: MoveSceneInput, event?: DomainEvent) {
    const scene = await tauriApi.moveScene(input);
    await refreshSnapshot();
    if (event) {
      enqueueAnalysis(event);
    }
    return scene as Scene;
  }

  async function saveManuscript(input: SaveManuscriptInput) {
    const scene = await tauriApi.saveManuscript(input);
    await refreshSnapshot();
    return scene as Scene;
  }

  async function saveCharacter(input: SaveCharacterInput, event?: DomainEvent) {
    const character = await tauriApi.saveCharacter(input);
    await refreshSnapshot();
    if (event) {
      enqueueAnalysis(event);
    }
    return character as Character;
  }

  async function updateSuggestion(input: UpdateSuggestionStatusInput) {
    if (input.status === "dismissed") {
      await tauriApi.dismissSuggestion(input);
    } else {
      await tauriApi.applySuggestion(input);
    }
    return refreshSnapshot();
  }

  async function saveProjectState(projectState: ProjectState) {
    const savedProjectState = await tauriApi.saveProjectState(projectState);
    queryClient.setQueryData<ProjectSnapshot | undefined>(
      ["projectSnapshot", projectState.projectId],
      (currentSnapshot) =>
        currentSnapshot
          ? {
              ...currentSnapshot,
              projectState: savedProjectState,
            }
          : currentSnapshot,
    );
    return savedProjectState;
  }

  async function queueAnalysis(event: DomainEvent) {
    enqueueAnalysis(event);
  }

  async function closeProject() {
    await tauriApi.closeProject();
    queryClient.removeQueries({ queryKey: ["projectSnapshot"] });
    resetUi();
  }

  return {
    restoreLastProject,
    createProject,
    openProject,
    closeProject,
    refreshSnapshot,
    saveChapter,
    reorderChapters,
    saveScene,
    moveScene,
    saveManuscript,
    saveCharacter,
    updateSuggestion,
    saveProjectState,
    queueAnalysis,
  };
}
