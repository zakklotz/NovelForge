// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    applyScratchpadResult: tauriApiMock.applyScratchpadResult,
  },
}));

class MockWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

describe("AppRouter loaded project flow", () => {
  beforeEach(() => {
    tauriApiMock.restoreLastProject.mockResolvedValue(null);
    tauriApiMock.closeProject.mockResolvedValue(undefined);
    tauriApiMock.getProjectSnapshot.mockResolvedValue(sampleProjectSnapshot);
    tauriApiMock.syncSuggestions.mockResolvedValue([]);
    tauriApiMock.saveProjectState.mockResolvedValue(sampleProjectSnapshot.projectState);
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
    window.history.pushState({}, "", "/");
    useUiStore.getState().resetUi();
    useUiStore.setState({ currentProjectId: sampleProjectSnapshot.project.id });
  });

  it("renders the chapters view for a loaded project without looping", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Chapters").length).toBeGreaterThan(0);
    });

    unmount();
    queryClient.clear();
  });

  it("restores the last valid project on launch", async () => {
    const restoredSnapshot = {
      ...sampleProjectSnapshot,
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/scenes" as const,
      },
    };
    tauriApiMock.restoreLastProject.mockResolvedValue(restoredSnapshot);
    useUiStore.getState().resetUi();

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Scenes").length).toBeGreaterThan(0);
    });

    unmount();
    queryClient.clear();
  });

  it("restores the last open chapter workspace route on launch", async () => {
    const restoredSnapshot = {
      ...sampleProjectSnapshot,
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/chapters/chapter-1",
      },
    };
    tauriApiMock.restoreLastProject.mockResolvedValue(restoredSnapshot);
    useUiStore.getState().resetUi();

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    expect(
      screen.getByDisplayValue("Chapter 1: The Wrong Package"),
    ).toBeTruthy();

    unmount();
    queryClient.clear();
  });
});
