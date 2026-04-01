// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { AppRouter } from "@/router";
import { useUiStore } from "@/store/uiStore";

const tauriApiMock = vi.hoisted(() => ({
  createProject: vi.fn(),
  openProject: vi.fn(),
  restoreLastProject: vi.fn(),
  closeProject: vi.fn(),
  getProjectSnapshot: vi.fn(),
  setProjectMetadata: vi.fn(),
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

const dialogMock = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const menuListeners = vi.hoisted(
  () => new Map<string, (event?: unknown) => void | Promise<void>>(),
);

const windowApiMock = vi.hoisted(() => {
  let closeRequestedHandler:
    | ((event: { preventDefault: () => void }) => void | Promise<void>)
    | null = null;
  const destroy = vi.fn();
  const onCloseRequested = vi.fn(
    async (callback: (event: { preventDefault: () => void }) => void | Promise<void>) => {
      closeRequestedHandler = callback;
      return () => {
        if (closeRequestedHandler === callback) {
          closeRequestedHandler = null;
        }
      };
    },
  );

  return {
    destroy,
    onCloseRequested,
    reset() {
      closeRequestedHandler = null;
      destroy.mockReset();
      onCloseRequested.mockClear();
    },
  };
});

vi.mock("@/lib/tauri", () => ({
  tauriApi: {
    createProject: tauriApiMock.createProject,
    openProject: tauriApiMock.openProject,
    restoreLastProject: tauriApiMock.restoreLastProject,
    closeProject: tauriApiMock.closeProject,
    getProjectSnapshot: tauriApiMock.getProjectSnapshot,
    setProjectMetadata: tauriApiMock.setProjectMetadata,
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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogMock.open,
  save: dialogMock.save,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (eventName: string, callback: (event?: unknown) => void | Promise<void>) => {
      menuListeners.set(eventName, callback);
      return () => {
        menuListeners.delete(eventName);
      };
    },
  ),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: windowApiMock.onCloseRequested,
    destroy: windowApiMock.destroy,
  }),
}));

class MockWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

describe("AppRouter loaded project flow", () => {
  beforeEach(() => {
    tauriApiMock.createProject.mockReset();
    tauriApiMock.openProject.mockReset();
    tauriApiMock.restoreLastProject.mockResolvedValue(null);
    tauriApiMock.closeProject.mockResolvedValue(undefined);
    tauriApiMock.getProjectSnapshot.mockResolvedValue(sampleProjectSnapshot);
    tauriApiMock.syncSuggestions.mockResolvedValue([]);
    tauriApiMock.saveProjectState.mockResolvedValue(sampleProjectSnapshot.projectState);
    dialogMock.open.mockReset();
    dialogMock.save.mockReset();
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

    menuListeners.clear();
    windowApiMock.reset();
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      configurable: true,
      value: {},
    });
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

  it("uses the same seeded brief flow for File > New Project inside an open workspace", async () => {
    dialogMock.save.mockResolvedValue("/tmp/ember-archive.novelforge");
    let currentSnapshot = sampleProjectSnapshot;
    const createdSnapshot = {
      ...sampleProjectSnapshot,
      project: {
        ...sampleProjectSnapshot.project,
        id: "project-ember-archive",
        title: "Ember Archive",
        logline: "A burned-out archivist discovers a war map hidden inside a saint's diary.",
        premise:
          "An archivist inherits a diary that rewrites itself whenever an old empire stirs.",
        centralConflict:
          "Every clue that could stop the war also exposes the family lie keeping Mara alive.",
        thematicIntent: "Ask whether truth still matters when survival depends on a myth.",
        genre: "Mythic political fantasy",
        tone: "Intimate, haunted, and sharp-edged",
      },
      chapters: [],
      scenes: [],
      characters: [],
      suggestions: [],
      projectState: {
        ...sampleProjectSnapshot.projectState,
        projectId: "project-ember-archive",
        lastRoute: "/story" as const,
      },
    };
    tauriApiMock.getProjectSnapshot.mockImplementation(async () => currentSnapshot);
    tauriApiMock.createProject.mockImplementation(async () => {
      currentSnapshot = createdSnapshot;
      return createdSnapshot;
    });

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

    await waitFor(() => {
      expect(menuListeners.has("novelforge://new-project")).toBe(true);
    });

    await act(async () => {
      await menuListeners.get("novelforge://new-project")?.();
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Create a new project" })).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Untitled Novel"), {
      target: { value: "Ember Archive" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Who wants what, what stands in the way, and why it matters."),
      {
        target: {
          value: "A burned-out archivist discovers a war map hidden inside a saint's diary.",
        },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("State the core setup the story is built around."), {
      target: {
        value: "An archivist inherits a diary that rewrites itself whenever an old empire stirs.",
      },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Name the pressure, opposition, or impossible bind driving the story.",
      ),
      {
        target: {
          value:
            "Every clue that could stop the war also exposes the family lie keeping Mara alive.",
        },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Optional Anchors" }));

    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the human question or tension the story wants to test.",
      ),
      {
        target: {
          value: "Ask whether truth still matters when survival depends on a myth.",
        },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("Science-fantasy adventure"), {
      target: { value: "Mythic political fantasy" },
    });
    fireEvent.change(screen.getByPlaceholderText("Tense and wonder-struck"), {
      target: { value: "Intimate, haunted, and sharp-edged" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New Project" }));

    await waitFor(() => {
      expect(tauriApiMock.createProject).toHaveBeenCalledWith({
        title: "Ember Archive",
        logline: "A burned-out archivist discovers a war map hidden inside a saint's diary.",
        premise:
          "An archivist inherits a diary that rewrites itself whenever an old empire stirs.",
        centralConflict:
          "Every clue that could stop the war also exposes the family lie keeping Mara alive.",
        thematicIntent: "Ask whether truth still matters when survival depends on a myth.",
        genre: "Mythic political fantasy",
        tone: "Intimate, haunted, and sharp-edged",
        path: "/tmp/ember-archive.novelforge",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/story");
      expect(screen.getByDisplayValue("Ember Archive")).toBeTruthy();
      expect(
        screen.getByDisplayValue(
          "A burned-out archivist discovers a war map hidden inside a saint's diary.",
        ),
      ).toBeTruthy();
      expect(
        screen.getByDisplayValue(
          "An archivist inherits a diary that rewrites itself whenever an old empire stirs.",
        ),
      ).toBeTruthy();
      expect(
        screen.queryByRole("dialog", { name: "Create a new project" }),
      ).toBeNull();
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

  it("restores the story spine route on launch", async () => {
    const restoredSnapshot = {
      ...sampleProjectSnapshot,
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/story" as const,
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
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    expect(window.location.pathname).toBe("/story");

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

  it("restores the last open scene workspace route on launch", async () => {
    const restoredSnapshot = {
      ...sampleProjectSnapshot,
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/scenes/scene-1",
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
      expect(screen.getByText("Scene Frame")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("Dock Nine Exchange")).toBeTruthy();
    expect(window.location.pathname).toBe("/scenes/scene-1");

    unmount();
    queryClient.clear();
  });

  it("falls back to the chapters view when a restored chapter route is stale", async () => {
    const restoredSnapshot = {
      ...sampleProjectSnapshot,
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/chapters/chapter-missing",
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
      expect(screen.getAllByText("Chapters").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Chapter not found")).toBeNull();
    expect(window.location.pathname).toBe("/chapters");

    unmount();
    queryClient.clear();
  });

  it("falls back to the scenes view when a restored scene route is stale", async () => {
    const restoredSnapshot = {
      ...sampleProjectSnapshot,
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/scenes/scene-missing",
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

    expect(screen.queryByText("Scene not found")).toBeNull();
    expect(window.location.pathname).toBe("/scenes");

    unmount();
    queryClient.clear();
  });
});

describe("AppRouter startup flow", () => {
  beforeEach(() => {
    tauriApiMock.createProject.mockReset();
    tauriApiMock.openProject.mockReset();
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
    dialogMock.open.mockReset();
    dialogMock.save.mockReset();

    menuListeners.clear();
    windowApiMock.reset();
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      configurable: true,
      value: {},
    });
    window.history.pushState({}, "", "/");
    useUiStore.getState().resetUi();
  });

  it("seeds the story brief during project creation and lands in the story workspace", async () => {
    dialogMock.save.mockResolvedValue("/tmp/ashen-sky.novelforge");
    const createdSnapshot = {
      ...sampleProjectSnapshot,
      project: {
        ...sampleProjectSnapshot.project,
        title: "Ashen Sky",
        logline: "A disgraced courier must smuggle a living map across a collapsing empire.",
        premise: "A failed courier becomes the only safe carrier for a living map.",
        centralConflict:
          "Every faction wants the map, and Ava does not trust herself to protect it.",
        thematicIntent: "Explore when responsibility turns into chosen freedom.",
        genre: "Science-fantasy adventure",
        tone: "Tense and wonder-struck",
      },
      chapters: [],
      scenes: [],
      characters: [],
      suggestions: [],
      projectState: {
        ...sampleProjectSnapshot.projectState,
        lastRoute: "/story" as const,
      },
    };
    tauriApiMock.createProject.mockResolvedValue(createdSnapshot);
    tauriApiMock.getProjectSnapshot.mockResolvedValue(createdSnapshot);

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
      expect(screen.getByText("No project open")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Untitled Novel"), {
      target: { value: "Ashen Sky" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Who wants what, what stands in the way, and why it matters."),
      {
        target: {
          value: "A disgraced courier must smuggle a living map across a collapsing empire.",
        },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("State the core setup the story is built around."), {
      target: {
        value: "A failed courier becomes the only safe carrier for a living map.",
      },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Name the pressure, opposition, or impossible bind driving the story.",
      ),
      {
        target: {
          value: "Every faction wants the map, and Ava does not trust herself to protect it.",
        },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Optional Anchors" }));

    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the human question or tension the story wants to test.",
      ),
      {
        target: { value: "Explore when responsibility turns into chosen freedom." },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("Science-fantasy adventure"), {
      target: {
        value: "Science-fantasy adventure",
      },
    });
    fireEvent.change(screen.getByPlaceholderText("Tense and wonder-struck"), {
      target: {
        value: "Tense and wonder-struck",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "New Project" }));

    await waitFor(() => {
      expect(tauriApiMock.createProject).toHaveBeenCalledWith({
        title: "Ashen Sky",
        logline: "A disgraced courier must smuggle a living map across a collapsing empire.",
        premise: "A failed courier becomes the only safe carrier for a living map.",
        centralConflict:
          "Every faction wants the map, and Ava does not trust herself to protect it.",
        thematicIntent: "Explore when responsibility turns into chosen freedom.",
        genre: "Science-fantasy adventure",
        tone: "Tense and wonder-struck",
        path: "/tmp/ashen-sky.novelforge",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    expect(window.location.pathname).toBe("/story");
    expect(screen.getByDisplayValue("Ashen Sky")).toBeTruthy();
    expect(
      screen.getByDisplayValue(
        "A disgraced courier must smuggle a living map across a collapsing empire.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue("A failed courier becomes the only safe carrier for a living map."),
    ).toBeTruthy();

    unmount();
    queryClient.clear();
  });
});
