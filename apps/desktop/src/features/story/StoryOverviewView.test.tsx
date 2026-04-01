// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { AppRouter } from "@/router";
import { useUiStore } from "@/store/uiStore";

const tauriApiMock = vi.hoisted(() => ({
  restoreLastProject: vi.fn(),
  closeProject: vi.fn(),
  getProjectSnapshot: vi.fn(),
  syncSuggestions: vi.fn(),
  saveProjectState: vi.fn(),
  getAppSettings: vi.fn(),
  saveAppSettings: vi.fn(),
  listRecommendedModels: vi.fn(),
  testProviderConnection: vi.fn(),
  runScratchpadChat: vi.fn(),
  runStructuredAiAction: vi.fn(),
  applyScratchpadResult: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  tauriApi: {
    createProject: vi.fn(),
    openProject: vi.fn(),
    restoreLastProject: tauriApiMock.restoreLastProject,
    closeProject: tauriApiMock.closeProject,
    getProjectSnapshot: tauriApiMock.getProjectSnapshot,
    saveChapter: vi.fn(),
    reorderChapters: vi.fn(),
    saveScene: vi.fn(),
    moveScene: vi.fn(),
    saveManuscript: vi.fn(),
    saveCharacter: vi.fn(),
    listSuggestions: vi.fn(),
    applySuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    saveProjectState: tauriApiMock.saveProjectState,
    syncSuggestions: tauriApiMock.syncSuggestions,
    getAppSettings: tauriApiMock.getAppSettings,
    saveAppSettings: tauriApiMock.saveAppSettings,
    listRecommendedModels: tauriApiMock.listRecommendedModels,
    testProviderConnection: tauriApiMock.testProviderConnection,
    runScratchpadChat: tauriApiMock.runScratchpadChat,
    runStructuredAiAction: tauriApiMock.runStructuredAiAction,
    applyScratchpadResult: tauriApiMock.applyScratchpadResult,
  },
}));

class MockWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

describe("StoryOverviewView", () => {
  let currentSnapshot = structuredClone(sampleProjectSnapshot);

  beforeEach(() => {
    vi.clearAllMocks();
    currentSnapshot = structuredClone(sampleProjectSnapshot);

    tauriApiMock.restoreLastProject.mockResolvedValue(null);
    tauriApiMock.closeProject.mockResolvedValue(undefined);
    tauriApiMock.getProjectSnapshot.mockImplementation(async () => currentSnapshot);
    tauriApiMock.syncSuggestions.mockResolvedValue([]);
    tauriApiMock.saveProjectState.mockImplementation(async (projectState) => {
      currentSnapshot = {
        ...currentSnapshot,
        projectState,
      };
      return projectState;
    });
    tauriApiMock.getAppSettings.mockResolvedValue({
      ai: {
        defaultProvider: "gemini",
        providers: {
          gemini: { enabled: true, hasApiKey: true, defaultModel: "gemini-2.5-flash" },
          groq: { enabled: true, hasApiKey: false, defaultModel: "llama-3.3-70b-versatile" },
          openrouter: { enabled: true, hasApiKey: false, defaultModel: "openrouter/free" },
        },
      },
    });
    tauriApiMock.listRecommendedModels.mockResolvedValue([]);

    vi.stubGlobal("Worker", MockWorker);
    window.history.pushState({}, "", "/story");
    useUiStore.getState().resetUi();
    useUiStore.setState({ currentProjectId: currentSnapshot.project.id });
  });

  afterEach(() => {
    cleanup();
    useUiStore.getState().resetUi();
  });

  function renderRouter() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>,
    );

    return {
      ...view,
      queryClient,
    };
  }

  it("shows low-risk structural chapter warnings on the spine", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      chapters: currentSnapshot.chapters.map((chapter) =>
        chapter.id === "chapter-2"
          ? {
              ...chapter,
              purpose: "",
              summary: "",
            }
          : chapter,
      ),
      scenes: currentSnapshot.scenes.filter((scene) => scene.chapterId !== "chapter-2"),
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const secondChapterCard = screen.getAllByRole("article")[1];
    expect(within(secondChapterCard).getByText("No purpose")).toBeTruthy();
    expect(within(secondChapterCard).getByText("No summary")).toBeTruthy();
    expect(within(secondChapterCard).getByText("No scenes")).toBeTruthy();
    expect(
      within(secondChapterCard).getByText("No scenes are assigned to this chapter yet."),
    ).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("opens the chapter workspace from a story spine card", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const firstChapterCard = screen.getAllByRole("article")[0];
    fireEvent.click(
      within(firstChapterCard).getByRole("button", {
        name: "Open Chapter Workspace",
      }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/chapters/chapter-1");
    });

    expect(screen.getByText("Scene Plan")).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("opens scene workspaces from the chapter scene preview list", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const firstChapterCard = screen.getAllByRole("article")[0];
    fireEvent.click(
      within(firstChapterCard).getByRole("button", {
        name: /Dock Nine Exchange/i,
      }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/scenes/scene-1");
    });

    expect(screen.getByText("Scene Frame")).toBeTruthy();

    unmount();
    queryClient.clear();
  });
});
