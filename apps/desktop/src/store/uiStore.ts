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

function areWorkbenchTabsEqual(left: WorkbenchTab[], right: WorkbenchTab[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => {
      const candidate = right[index];
      return (
        value.id === candidate?.id &&
        value.kind === candidate?.kind &&
        value.route === candidate?.route &&
        value.entityId === candidate?.entityId &&
        value.closeable === candidate?.closeable
      );
    })
  );
}

function areDirtyAreasEqual(
  left: WorkspaceDirtyArea[],
  right: WorkspaceDirtyArea[],
) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function areWorkspaceSessionsEqual(
  left: WorkspaceSession | null,
  right: WorkspaceSession | null,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.kind === right.kind &&
    left.entityId === right.entityId &&
    left.entityTitle === right.entityTitle &&
    areDirtyAreasEqual(left.dirtyAreas, right.dirtyAreas) &&
    left.saveChanges === right.saveChanges &&
    left.discardChanges === right.discardChanges
  );
}

function arePendingWorkspaceActionsEqual(
  left: PendingWorkspaceAction | null,
  right: PendingWorkspaceAction | null,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.targetLabel === right.targetLabel && left.runAction === right.runAction;
}

function areDiagnosticJumpHighlightsEqual(
  left: DiagnosticJumpHighlight | null,
  right: DiagnosticJumpHighlight | null,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.kind === right.kind && left.id === right.id;
}

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  setCurrentProjectId: (currentProjectId) =>
    set((state) =>
      state.currentProjectId === currentProjectId ? state : { currentProjectId },
    ),
  setSelectedChapterId: (selectedChapterId) =>
    set((state) =>
      state.selectedChapterId === selectedChapterId ? state : { selectedChapterId },
    ),
  setSelectedCharacterId: (selectedCharacterId) =>
    set((state) =>
      state.selectedCharacterId === selectedCharacterId
        ? state
        : { selectedCharacterId },
    ),
  setSelectedSuggestionId: (selectedSuggestionId) =>
    set((state) =>
      state.selectedSuggestionId === selectedSuggestionId
        ? state
        : { selectedSuggestionId },
    ),
  setSearchText: (searchText) =>
    set((state) => (state.searchText === searchText ? state : { searchText })),
  enqueueAnalysis: (event) =>
    set((state) => ({ analysisQueue: [...state.analysisQueue, event] })),
  dequeueAnalysis: () =>
    set((state) => ({ analysisQueue: state.analysisQueue.slice(1) })),
  setIsAnalyzing: (isAnalyzing) =>
    set((state) => (state.isAnalyzing === isAnalyzing ? state : { isAnalyzing })),
  setWorkbenchActivity: (workbenchActivity) =>
    set((state) =>
      state.workbenchActivity === workbenchActivity ? state : { workbenchActivity },
    ),
  openEditorTab: (tab) =>
    set((state) => {
      const existingIndex = state.editorTabs.findIndex((candidate) => candidate.id === tab.id);
      if (existingIndex === -1) {
        return {
          editorTabs: [...state.editorTabs, tab],
          activeEditorTabId: tab.id,
        };
      }

      const existingTab = state.editorTabs[existingIndex];
      const nextTab =
        existingTab.kind === tab.kind &&
        existingTab.route === tab.route &&
        existingTab.entityId === tab.entityId &&
        existingTab.closeable === tab.closeable
          ? existingTab
          : { ...existingTab, ...tab };
      const editorTabs =
        nextTab === existingTab
          ? state.editorTabs
          : state.editorTabs.map((candidate, index) =>
              index === existingIndex ? nextTab : candidate,
            );

      if (editorTabs === state.editorTabs && state.activeEditorTabId === tab.id) {
        return state;
      }

      return {
        editorTabs,
        activeEditorTabId: tab.id,
      };
    }),
  closeEditorTab: (tabId) =>
    set((state) => {
      const tabExists = state.editorTabs.some((tab) => tab.id === tabId);
      if (!tabExists) {
        return state;
      }

      return {
        editorTabs: state.editorTabs.filter((tab) => tab.id !== tabId),
        activeEditorTabId:
          state.activeEditorTabId === tabId ? null : state.activeEditorTabId,
      };
    }),
  setActiveEditorTab: (activeEditorTabId) =>
    set((state) =>
      state.activeEditorTabId === activeEditorTabId ? state : { activeEditorTabId },
    ),
  setEditorTabs: (editorTabs) =>
    set((state) => (areWorkbenchTabsEqual(state.editorTabs, editorTabs) ? state : { editorTabs })),
  setWorkspaceSession: (workspaceSession) =>
    set((state) =>
      areWorkspaceSessionsEqual(state.workspaceSession, workspaceSession)
        ? state
        : { workspaceSession },
    ),
  setPendingWorkspaceAction: (pendingWorkspaceAction) =>
    set((state) =>
      arePendingWorkspaceActionsEqual(state.pendingWorkspaceAction, pendingWorkspaceAction)
        ? state
        : { pendingWorkspaceAction },
    ),
  setDiagnosticJumpHighlight: (diagnosticJumpHighlight) =>
    set((state) =>
      areDiagnosticJumpHighlightsEqual(
        state.diagnosticJumpHighlight,
        diagnosticJumpHighlight,
      )
        ? state
        : { diagnosticJumpHighlight },
    ),
  resetUi: () => set(initialState),
}));
