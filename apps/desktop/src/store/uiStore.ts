import { create } from "zustand";
import type { DomainEvent } from "@novelforge/domain";

type SceneSidebarTab = "chapter" | "characters" | "warnings";

interface UiState {
  currentProjectId: string | null;
  selectedChapterId: string | null;
  selectedCharacterId: string | null;
  searchText: string;
  sceneSidebarTab: SceneSidebarTab;
  analysisQueue: DomainEvent[];
  isAnalyzing: boolean;
  setCurrentProjectId: (projectId: string | null) => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setSearchText: (searchText: string) => void;
  setSceneSidebarTab: (tab: SceneSidebarTab) => void;
  enqueueAnalysis: (event: DomainEvent) => void;
  dequeueAnalysis: () => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  resetUi: () => void;
}

const initialState = {
  currentProjectId: null,
  selectedChapterId: null,
  selectedCharacterId: null,
  searchText: "",
  sceneSidebarTab: "chapter" as SceneSidebarTab,
  analysisQueue: [],
  isAnalyzing: false,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setSelectedCharacterId: (selectedCharacterId) => set({ selectedCharacterId }),
  setSearchText: (searchText) => set({ searchText }),
  setSceneSidebarTab: (sceneSidebarTab) => set({ sceneSidebarTab }),
  enqueueAnalysis: (event) =>
    set((state) => ({ analysisQueue: [...state.analysisQueue, event] })),
  dequeueAnalysis: () =>
    set((state) => ({ analysisQueue: state.analysisQueue.slice(1) })),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  resetUi: () => set(initialState),
}));
