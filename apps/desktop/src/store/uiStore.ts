import { create } from "zustand";
import type { DomainEvent } from "@novelforge/domain";

export type WorkspaceDirtyArea = "planning" | "draft";

export interface WorkspaceSession {
  kind: "scene" | "chapter" | "story";
  entityId: string;
  entityTitle: string;
  dirtyAreas: WorkspaceDirtyArea[];
  saveChanges: () => Promise<void>;
  discardChanges: () => Promise<void>;
}

export interface PendingWorkspaceAction {
  targetLabel: string;
  runAction: () => Promise<void>;
}

export interface DiagnosticJumpHighlight {
  kind: "chapter" | "scene";
  id: string;
}

interface UiState {
  currentProjectId: string | null;
  selectedChapterId: string | null;
  selectedCharacterId: string | null;
  searchText: string;
  analysisQueue: DomainEvent[];
  isAnalyzing: boolean;
  workspaceSession: WorkspaceSession | null;
  pendingWorkspaceAction: PendingWorkspaceAction | null;
  diagnosticJumpHighlight: DiagnosticJumpHighlight | null;
  setCurrentProjectId: (projectId: string | null) => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setSearchText: (searchText: string) => void;
  enqueueAnalysis: (event: DomainEvent) => void;
  dequeueAnalysis: () => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setWorkspaceSession: (session: WorkspaceSession | null) => void;
  setPendingWorkspaceAction: (action: PendingWorkspaceAction | null) => void;
  setDiagnosticJumpHighlight: (highlight: DiagnosticJumpHighlight | null) => void;
  resetUi: () => void;
}

const initialState = {
  currentProjectId: null,
  selectedChapterId: null,
  selectedCharacterId: null,
  searchText: "",
  analysisQueue: [],
  isAnalyzing: false,
  workspaceSession: null,
  pendingWorkspaceAction: null,
  diagnosticJumpHighlight: null,
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
  setWorkspaceSession: (workspaceSession) => set({ workspaceSession }),
  setPendingWorkspaceAction: (pendingWorkspaceAction) =>
    set({ pendingWorkspaceAction }),
  setDiagnosticJumpHighlight: (diagnosticJumpHighlight) =>
    set({ diagnosticJumpHighlight }),
  resetUi: () => set(initialState),
}));
