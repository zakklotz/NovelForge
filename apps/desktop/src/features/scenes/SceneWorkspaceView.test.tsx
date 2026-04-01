// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { AppRouter } from "@/router";
import { useUiStore } from "@/store/uiStore";

const tauriApiMock = vi.hoisted(() => ({
  restoreLastProject: vi.fn(),
  closeProject: vi.fn(),
  getProjectSnapshot: vi.fn(),
  saveScene: vi.fn(),
  saveManuscript: vi.fn(),
  syncSuggestions: vi.fn(),
  saveProjectState: vi.fn(),
  getAppSettings: vi.fn(),
  saveAppSettings: vi.fn(),
  listRecommendedModels: vi.fn(),
  testProviderConnection: vi.fn(),
  runScratchpadChat: vi.fn(),
  applyScratchpadResult: vi.fn(),
}));

const menuListeners = vi.hoisted(
  () => new Map<string, (event?: unknown) => void | Promise<void>>(),
);

const tiptapMock = vi.hoisted(() => {
  let html = "<p></p>";
  let hasMounted = false;
  let onUpdate:
    | ((payload: { editor: { getHTML: () => string } }) => void)
    | null = null;

  const editor = {
    getHTML: vi.fn(() => html),
    commands: {
      setContent: vi.fn((nextHtml: string) => {
        html = nextHtml;
      }),
    },
  };

  return {
    editor,
    mount(config: { content?: string; onUpdate?: typeof onUpdate }) {
      if (!hasMounted) {
        html = typeof config.content === "string" ? config.content : "<p></p>";
        hasMounted = true;
      }
      onUpdate = config.onUpdate ?? null;
      return editor;
    },
    reset(nextHtml = "<p></p>") {
      html = nextHtml;
      hasMounted = false;
      onUpdate = null;
      editor.getHTML.mockImplementation(() => html);
      editor.commands.setContent.mockClear();
    },
    triggerUpdate(nextHtml: string) {
      html = nextHtml;
      onUpdate?.({
        editor: {
          getHTML: () => html,
        },
      });
    },
  };
});

vi.mock("@/lib/tauri", () => ({
  tauriApi: {
    createProject: vi.fn(),
    openProject: vi.fn(),
    restoreLastProject: tauriApiMock.restoreLastProject,
    closeProject: tauriApiMock.closeProject,
    getProjectSnapshot: tauriApiMock.getProjectSnapshot,
    saveChapter: vi.fn(),
    reorderChapters: vi.fn(),
    saveScene: tauriApiMock.saveScene,
    moveScene: vi.fn(),
    saveManuscript: tauriApiMock.saveManuscript,
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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tiptap/react", () => ({
  useEditor: (config: {
    content?: string;
    onUpdate?: ((payload: { editor: { getHTML: () => string } }) => void) | null;
  }) =>
    tiptapMock.mount(config),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: {},
}));

class MockWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

describe("Scene workspace unsaved change protection", () => {
  let currentSnapshot = structuredClone(sampleProjectSnapshot);

  beforeEach(() => {
    vi.clearAllMocks();
    currentSnapshot = structuredClone(sampleProjectSnapshot);
    tiptapMock.reset(sampleProjectSnapshot.scenes[0].manuscriptText);
    menuListeners.clear();
    vi.useRealTimers();
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      configurable: true,
      value: {},
    });

    useUiStore.getState().resetUi();
    useUiStore.setState({ currentProjectId: currentSnapshot.project.id });

    tauriApiMock.restoreLastProject.mockResolvedValue(null);
    tauriApiMock.closeProject.mockResolvedValue(undefined);
    tauriApiMock.getProjectSnapshot.mockImplementation(async () => currentSnapshot);
    tauriApiMock.saveScene.mockImplementation(async (input) => {
      const updatedScene = {
        ...currentSnapshot.scenes.find((scene) => scene.id === input.id)!,
        ...input,
      };
      currentSnapshot = {
        ...currentSnapshot,
        scenes: currentSnapshot.scenes.map((scene) =>
          scene.id === input.id ? updatedScene : scene,
        ),
      };
      return updatedScene;
    });
    tauriApiMock.saveManuscript.mockImplementation(
      async ({ sceneId, manuscriptText }) => {
        const updatedScene = {
          ...currentSnapshot.scenes.find((scene) => scene.id === sceneId)!,
          manuscriptText,
        };
        currentSnapshot = {
          ...currentSnapshot,
          scenes: currentSnapshot.scenes.map((scene) =>
            scene.id === sceneId ? updatedScene : scene,
          ),
        };
        return updatedScene;
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
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderSceneWorkspace(route = "/scenes/scene-1") {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    window.history.pushState({}, "", route);

    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>,
    );

    return {
      ...rendered,
      queryClient,
    };
  }

  it("keeps unsaved planning edits in place when draft autosave refreshes the snapshot", async () => {
    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Local planning notes stay put." },
    });

    await act(async () => {
      tiptapMock.triggerUpdate("<p>Fresh draft paragraph.</p>");
    });

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tauriApiMock.saveManuscript).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      manuscriptText: "<p>Fresh draft paragraph.</p>",
    });

    expect(
      (screen.getByLabelText(/summary/i) as HTMLTextAreaElement).value,
    ).toBe("Local planning notes stay put.");
    expect(screen.getByRole("button", { name: /save planning/i })).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("blocks scene switches until the user saves or cancels", async () => {
    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Updated before switching scenes." },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /the crate speaks/i })[0]!);

    await screen.findByText("Unsaved scene changes");
    expect(window.location.pathname).toBe("/scenes/scene-1");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText("Unsaved scene changes")).toBeNull();
    });
    expect(window.location.pathname).toBe("/scenes/scene-1");

    fireEvent.click(screen.getAllByRole("button", { name: /the crate speaks/i })[0]!);
    await screen.findByText("Unsaved scene changes");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(tauriApiMock.saveScene).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "scene-1",
          summary: "Updated before switching scenes.",
        }),
      );
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/scenes/scene-2");
    });

    unmount();
    queryClient.clear();
  });

  it("protects close project and allows discarding local scene edits", async () => {
    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "This should be discarded." },
    });

    await act(async () => {
      useUiStore.getState().setPendingSceneWorkspaceAction({
        targetLabel: "close the current project",
        runAction: async () => {
          await tauriApiMock.closeProject();
          useUiStore.getState().resetUi();
        },
      });
    });

    await screen.findByText("Unsaved scene changes");
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    await waitFor(() => {
      expect(tauriApiMock.closeProject).toHaveBeenCalled();
    });

    await screen.findByText("No project open");

    unmount();
    queryClient.clear();
  });
});
