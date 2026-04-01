// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { AppRouter } from "@/router";
import { useUiStore } from "@/store/uiStore";

const tauriApiMock = vi.hoisted(() => ({
  restoreLastProject: vi.fn(),
  closeProject: vi.fn(),
  getProjectSnapshot: vi.fn(),
  saveChapter: vi.fn(),
  saveScene: vi.fn(),
  syncSuggestions: vi.fn(),
  saveProjectState: vi.fn(),
  getAppSettings: vi.fn(),
  saveAppSettings: vi.fn(),
  listRecommendedModels: vi.fn(),
  testProviderConnection: vi.fn(),
  runScratchpadChat: vi.fn(),
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
    reorderChapters: vi.fn(),
    saveScene: tauriApiMock.saveScene,
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
    applyScratchpadResult: tauriApiMock.applyScratchpadResult,
  },
}));

class MockWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

describe("Chapter workspace", () => {
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

    tauriApiMock.saveChapter.mockImplementation(async (input) => {
      const existingChapter = currentSnapshot.chapters.find(
        (chapter) => chapter.id === input.id,
      )!;
      const savedChapter = {
        ...existingChapter,
        ...input,
        updatedAt: "2026-03-31T12:00:00.000Z",
      };
      currentSnapshot = {
        ...currentSnapshot,
        chapters: currentSnapshot.chapters.map((chapter) =>
          chapter.id === savedChapter.id ? savedChapter : chapter,
        ),
      };
      return savedChapter;
    });

    tauriApiMock.saveScene.mockImplementation(async (input) => {
      const nextIndex =
        currentSnapshot.scenes.filter(
          (scene) => (scene.chapterId ?? null) === (input.chapterId ?? null),
        ).length;
      const savedScene = {
        ...input,
        orderIndex: nextIndex,
        createdAt: "2026-03-31T12:00:00.000Z",
        updatedAt: "2026-03-31T12:00:00.000Z",
      };
      currentSnapshot = {
        ...currentSnapshot,
        scenes: [...currentSnapshot.scenes, savedScene],
      };
      return savedScene;
    });

    vi.stubGlobal("Worker", MockWorker);
    window.history.pushState({}, "", "/chapters/chapter-1");
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

  it("renders chapter planning details with scenes in chapter order", async () => {
    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("Chapter 1: The Wrong Package")).toBeTruthy();
    expect(
      screen.getByDisplayValue("Launch the novel's central threat and lock Ava into the mission."),
    ).toBeTruthy();
    expect(screen.getByText("Dock Nine Exchange")).toBeTruthy();
    expect(screen.getByText("The Crate Speaks")).toBeTruthy();
    expect(screen.getByText("Inciting incident")).toBeTruthy();
    expect(screen.getByText("Show the map has agency.")).toBeTruthy();

    const firstScene = screen.getByText("Dock Nine Exchange");
    const secondScene = screen.getByText("The Crate Speaks");
    expect(
      firstScene.compareDocumentPosition(secondScene) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("keeps unsaved chapter edits in place when adding a scene refreshes the snapshot", async () => {
    const { unmount, queryClient } = renderRouter();

    const summaryPlaceholder = "Summarize the chapter's visible movement.";
    await waitFor(() => {
      expect(screen.getByPlaceholderText(summaryPlaceholder)).toBeTruthy();
    });

    const summaryField = screen.getByPlaceholderText(
      summaryPlaceholder,
    ) as HTMLTextAreaElement;
    fireEvent.change(summaryField, {
      target: {
        value: "Ava commits to the mission while the chapter tightens around that choice.",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Add Scene/i }));

    await waitFor(() => {
      expect(tauriApiMock.saveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.saveScene).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: "chapter-1",
        title: "Scene 3",
        orderIndex: 2,
        involvedCharacterIds: [],
        continuityTags: [],
        dependencySceneIds: [],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Scene 3")).toBeTruthy();
    });

    expect(
      (screen.getByPlaceholderText(summaryPlaceholder) as HTMLTextAreaElement).value,
    ).toBe(
      "Ava commits to the mission while the chapter tightens around that choice.",
    );

    unmount();
    queryClient.clear();
  });

  it("persists the active chapter workspace route", async () => {
    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    await waitFor(() => {
      expect(tauriApiMock.saveProjectState).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: currentSnapshot.project.id,
          lastRoute: "/chapters/chapter-1",
        }),
      );
    });

    unmount();
    queryClient.clear();
  });

  it("blocks chapter switches until the user saves or cancels", async () => {
    const { unmount, queryClient } = renderRouter();

    const summaryPlaceholder = "Summarize the chapter's visible movement.";
    await waitFor(() => {
      expect(screen.getByPlaceholderText(summaryPlaceholder)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(summaryPlaceholder), {
      target: {
        value: "Ava updates the chapter plan before leaving this workspace.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /chapter 2: border sparks/i }),
    );

    await screen.findByText("Unsaved chapter changes");
    expect(window.location.pathname).toBe("/chapters/chapter-1");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText("Unsaved chapter changes")).toBeNull();
    });
    expect(window.location.pathname).toBe("/chapters/chapter-1");

    fireEvent.click(
      screen.getByRole("button", { name: /chapter 2: border sparks/i }),
    );

    await screen.findByText("Unsaved chapter changes");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(tauriApiMock.saveChapter).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "chapter-1",
          summary: "Ava updates the chapter plan before leaving this workspace.",
        }),
      );
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/chapters/chapter-2");
    });

    unmount();
    queryClient.clear();
  });

  it("protects pending project actions and allows discarding local chapter edits", async () => {
    const { unmount, queryClient } = renderRouter();

    const summaryPlaceholder = "Summarize the chapter's visible movement.";
    await waitFor(() => {
      expect(screen.getByPlaceholderText(summaryPlaceholder)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(summaryPlaceholder), {
      target: {
        value: "This should be discarded before closing the project.",
      },
    });

    const closeProjectAction = vi.fn(async () => undefined);

    await act(async () => {
      useUiStore.getState().setPendingWorkspaceAction({
        targetLabel: "close the current project",
        runAction: closeProjectAction,
      });
    });

    await screen.findByText("Unsaved chapter changes");
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    await waitFor(() => {
      expect(closeProjectAction).toHaveBeenCalledTimes(1);
    });

    expect(
      (screen.getByPlaceholderText(summaryPlaceholder) as HTMLTextAreaElement).value,
    ).toBe("Ava accepts a courier job she does not understand.");

    unmount();
    queryClient.clear();
  });
});
