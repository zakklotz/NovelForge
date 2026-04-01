import { create } from "zustand";
import type { DomainEvent } from "@novelforge/domain";

export type SceneWorkspaceDirtyArea = "planning" | "draft";

export interface SceneWorkspaceSession {
  sceneId: string;
  sceneTitle: string;
  dirtyAreas: SceneWorkspaceDirtyArea[];
  saveChanges: () => Promise<void>;
  discardChanges: () => Promise<void>;
}

export interface PendingSceneWorkspaceAction {
  targetLabel: string;
  runAction: () => Promise<void>;
}

interface UiState {
  currentProjectId: string | null;
  selectedChapterId: string | null;
  selectedCharacterId: string | null;
  searchText: string;
  analysisQueue: DomainEvent[];
  isAnalyzing: boolean;
  sceneWorkspaceSession: SceneWorkspaceSession | null;
  pendingSceneWorkspaceAction: PendingSceneWorkspaceAction | null;
  setCurrentProjectId: (projectId: string | null) => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setSearchText: (searchText: string) => void;
  enqueueAnalysis: (event: DomainEvent) => void;
  dequeueAnalysis: () => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setSceneWorkspaceSession: (session: SceneWorkspaceSession | null) => void;
  setPendingSceneWorkspaceAction: (
    action: PendingSceneWorkspaceAction | null,
  ) => void;
  resetUi: () => void;
}

const initialState = {
  currentProjectId: null,
  selectedChapterId: null,
  selectedCharacterId: null,
  searchText: "",
  analysisQueue: [],
  isAnalyzing: false,
  sceneWorkspaceSession: null,
  pendingSceneWorkspaceAction: null,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setSelectedCharacterId: (selectedCharacterId) => set({ selectedCharacterId }),
  setSearchText: (searchText) => set({ searchText }),
  enqueueAnalysis: (event) =>
    set((state) => ({ analysisQueue: [...state.analysisQueue, event] })),
  dequeueAnalysis: () =>
    set((state) => ({ analysisQueue: state.analysisQueue.slice(1) })),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setSceneWorkspaceSession: (sceneWorkspaceSession) =>
    set({ sceneWorkspaceSession }),
  setPendingSceneWorkspaceAction: (pendingSceneWorkspaceAction) =>
    set({ pendingSceneWorkspaceAction }),
  resetUi: () => set(initialState),
}));
