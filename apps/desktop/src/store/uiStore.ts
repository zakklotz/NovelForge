import { create } from "zustand";
import type { DomainEvent } from "@novelforge/domain";

export type WorkspaceDirtyArea = "planning" | "draft";

export type WorkbenchActivityId =
  | "explorer"
  | "story"
  | "suggestions"
  | "characters"
  | "ai";

export type WorkbenchTabKind =
  | "story"
  | "chapters"
  | "chapter"
  | "scenes"
  | "scene"
  | "characters"
  | "character"
  | "suggestions"
  | "suggestion"
  | "scratchpad"
  | "settings";

export interface WorkbenchTab {
  id: string;
  kind: WorkbenchTabKind;
  route: string;
  entityId: string | null;
  closeable: boolean;
}

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
  selectedSuggestionId: string | null;
  searchText: string;
  analysisQueue: DomainEvent[];
  isAnalyzing: boolean;
  workbenchActivity: WorkbenchActivityId;
  editorTabs: WorkbenchTab[];
  activeEditorTabId: string | null;
  workspaceSession: WorkspaceSession | null;
  pendingWorkspaceAction: PendingWorkspaceAction | null;
  diagnosticJumpHighlight: DiagnosticJumpHighlight | null;
  setCurrentProjectId: (projectId: string | null) => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setSelectedSuggestionId: (suggestionId: string | null) => void;
  setSearchText: (searchText: string) => void;
  enqueueAnalysis: (event: DomainEvent) => void;
  dequeueAnalysis: () => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setWorkbenchActivity: (activity: WorkbenchActivityId) => void;
  openEditorTab: (tab: WorkbenchTab) => void;
  closeEditorTab: (tabId: string) => void;
  setActiveEditorTab: (tabId: string | null) => void;
  setEditorTabs: (tabs: WorkbenchTab[]) => void;
  setWorkspaceSession: (session: WorkspaceSession | null) => void;
  setPendingWorkspaceAction: (action: PendingWorkspaceAction | null) => void;
  setDiagnosticJumpHighlight: (highlight: DiagnosticJumpHighlight | null) => void;
  resetUi: () => void;
}

const initialState = {
  currentProjectId: null,
  selectedChapterId: null,
  selectedCharacterId: null,
  selectedSuggestionId: null,
  searchText: "",
  analysisQueue: [],
  isAnalyzing: false,
  workbenchActivity: "explorer" as WorkbenchActivityId,
  editorTabs: [] as WorkbenchTab[],
  activeEditorTabId: null,
  workspaceSession: null,
  pendingWorkspaceAction: null,
  diagnosticJumpHighlight: null,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setSelectedCharacterId: (selectedCharacterId) => set({ selectedCharacterId }),
  setSelectedSuggestionId: (selectedSuggestionId) => set({ selectedSuggestionId }),
  setSearchText: (searchText) => set({ searchText }),
  enqueueAnalysis: (event) =>
    set((state) => ({ analysisQueue: [...state.analysisQueue, event] })),
  dequeueAnalysis: () =>
    set((state) => ({ analysisQueue: state.analysisQueue.slice(1) })),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setWorkbenchActivity: (workbenchActivity) => set({ workbenchActivity }),
  openEditorTab: (tab) =>
    set((state) => {
      const existingIndex = state.editorTabs.findIndex((candidate) => candidate.id === tab.id);
      const editorTabs =
        existingIndex === -1
          ? [...state.editorTabs, tab]
          : state.editorTabs.map((candidate, index) =>
              index === existingIndex ? { ...candidate, ...tab } : candidate,
            );

      return {
        editorTabs,
        activeEditorTabId: tab.id,
      };
    }),
  closeEditorTab: (tabId) =>
    set((state) => ({
      editorTabs: state.editorTabs.filter((tab) => tab.id !== tabId),
      activeEditorTabId:
        state.activeEditorTabId === tabId ? null : state.activeEditorTabId,
    })),
  setActiveEditorTab: (activeEditorTabId) => set({ activeEditorTabId }),
  setEditorTabs: (editorTabs) => set({ editorTabs }),
  setWorkspaceSession: (workspaceSession) => set({ workspaceSession }),
  setPendingWorkspaceAction: (pendingWorkspaceAction) =>
    set({ pendingWorkspaceAction }),
  setDiagnosticJumpHighlight: (diagnosticJumpHighlight) =>
    set({ diagnosticJumpHighlight }),
  resetUi: () => set(initialState),
}));
