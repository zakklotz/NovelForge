import { create } from "zustand";
import type { DomainEvent } from "@novelforge/domain";

interface UiState {
  currentProjectId: string | null;
  selectedChapterId: string | null;
  selectedCharacterId: string | null;
  searchText: string;
  analysisQueue: DomainEvent[];
  isAnalyzing: boolean;
  setCurrentProjectId: (projectId: string | null) => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setSearchText: (searchText: string) => void;
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
  analysisQueue: [],
  isAnalyzing: false,
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
  resetUi: () => set(initialState),
}));
