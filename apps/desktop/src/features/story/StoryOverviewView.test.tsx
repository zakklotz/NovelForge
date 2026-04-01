// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveChapterInput } from "@novelforge/domain";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { AppRouter } from "@/router";
import { useUiStore } from "@/store/uiStore";

const tauriApiMock = vi.hoisted(() => ({
  restoreLastProject: vi.fn(),
  closeProject: vi.fn(),
  getProjectSnapshot: vi.fn(),
  saveChapter: vi.fn(),
  reorderChapters: vi.fn(),
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
    saveChapter: tauriApiMock.saveChapter,
    reorderChapters: tauriApiMock.reorderChapters,
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

function reorderChaptersInSnapshot(
  snapshot: typeof sampleProjectSnapshot,
  chapterIds: string[],
) {
  const orderIndexById = new Map(chapterIds.map((chapterId, index) => [chapterId, index]));

  return {
    ...snapshot,
    chapters: snapshot.chapters
      .map((chapter) => ({
        ...chapter,
        orderIndex: orderIndexById.get(chapter.id) ?? chapter.orderIndex,
        updatedAt: "2026-04-01T12:00:00.000Z",
      }))
      .sort((left, right) => left.orderIndex - right.orderIndex),
  };
}

describe("StoryOverviewView", () => {
  let currentSnapshot = structuredClone(sampleProjectSnapshot);

  beforeEach(() => {
    vi.clearAllMocks();
    currentSnapshot = structuredClone(sampleProjectSnapshot);

    tauriApiMock.restoreLastProject.mockResolvedValue(null);
    tauriApiMock.closeProject.mockResolvedValue(undefined);
    tauriApiMock.getProjectSnapshot.mockImplementation(async () => currentSnapshot);
    tauriApiMock.saveChapter.mockImplementation(async (input: SaveChapterInput) => {
      const savedChapter = {
        ...input,
        createdAt: "2026-04-01T12:00:00.000Z",
        updatedAt: "2026-04-01T12:00:00.000Z",
      };
      currentSnapshot = {
        ...currentSnapshot,
        chapters: [...currentSnapshot.chapters, savedChapter],
      };
      return savedChapter;
    });
    tauriApiMock.reorderChapters.mockImplementation(
      async (_projectId: string, chapterIds: string[]) => {
      currentSnapshot = reorderChaptersInSnapshot(currentSnapshot, chapterIds);
      return currentSnapshot.chapters;
      },
    );
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

  it("adds a new chapter directly from the story spine", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Chapter",
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(3);
    });

    expect(window.location.pathname).toBe("/story");
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((element) => element.textContent),
    ).toContain("Chapter 3");
    expect(tauriApiMock.saveChapter).toHaveBeenCalledTimes(1);
    expect(tauriApiMock.saveChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Chapter 3",
        projectId: sampleProjectSnapshot.project.id,
        orderIndex: 2,
      }),
    );

    unmount();
    queryClient.clear();
  });

  it("moves chapters through the backend reorder flow", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const firstChapterCard = screen.getAllByRole("article")[0];
    fireEvent.click(
      within(firstChapterCard).getByRole("button", {
        name: /Move Chapter 1: The Wrong Package later/i,
      }),
    );

    await waitFor(() => {
      const chapterHeadings = screen
        .getAllByRole("heading", { level: 3 })
        .map((element) => element.textContent);
      expect(chapterHeadings.slice(0, 2)).toEqual([
        "Chapter 2: Border Sparks",
        "Chapter 1: The Wrong Package",
      ]);
    });

    expect(tauriApiMock.reorderChapters).toHaveBeenCalledWith(
      sampleProjectSnapshot.project.id,
      ["chapter-2", "chapter-1"],
    );

    unmount();
    queryClient.clear();
  });

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
