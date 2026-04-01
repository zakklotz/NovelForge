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
  runStructuredAiAction: vi.fn(),
  applyScratchpadResult: vi.fn(),
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
    async triggerCloseRequested() {
      if (!closeRequestedHandler) {
        throw new Error("Native close listener was not registered.");
      }

      let prevented = false;
      await closeRequestedHandler({
        preventDefault: () => {
          prevented = true;
        },
      });

      return { prevented };
    },
  };
});

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
    runStructuredAiAction: tauriApiMock.runStructuredAiAction,
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

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: windowApiMock.onCloseRequested,
    destroy: windowApiMock.destroy,
  }),
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
    windowApiMock.reset();
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

  async function requestNativeClose() {
    let result: { prevented: boolean } | null = null;
    await act(async () => {
      result = await windowApiMock.triggerCloseRequested();
    });
    if (!result) {
      throw new Error("Native close request did not produce a result.");
    }
    return result;
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
      useUiStore.getState().setPendingWorkspaceAction({
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

  it("blocks native window close until the user cancels or resolves the prompt", async () => {
    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Keep the app open for now." },
    });

    await expect(requestNativeClose()).resolves.toEqual({ prevented: true });
    await screen.findByText("Unsaved scene changes");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText("Unsaved scene changes")).toBeNull();
    });
    expect(windowApiMock.destroy).not.toHaveBeenCalled();

    unmount();
    queryClient.clear();
  });

  it("waits for save completion before allowing native window close", async () => {
    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Save before closing the app." },
    });

    let resolveSaveScene: (() => void) | undefined;
    tauriApiMock.saveScene.mockImplementationOnce(
      async (input: { id: string; [key: string]: unknown }) => {
        await new Promise<void>((resolve) => {
          resolveSaveScene = resolve;
        });

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
      },
    );

    await expect(requestNativeClose()).resolves.toEqual({ prevented: true });
    await screen.findByText("Unsaved scene changes");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(tauriApiMock.saveScene).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "scene-1",
          summary: "Save before closing the app.",
        }),
      );
    });
    expect(windowApiMock.destroy).not.toHaveBeenCalled();

    if (!resolveSaveScene) {
      throw new Error("Scene save did not start.");
    }
    resolveSaveScene();

    await waitFor(() => {
      expect(windowApiMock.destroy).toHaveBeenCalledTimes(1);
    });

    unmount();
    queryClient.clear();
  });

  it("allows native window close after discarding local scene edits", async () => {
    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Discard this before app close." },
    });

    await expect(requestNativeClose()).resolves.toEqual({ prevented: true });
    await screen.findByText("Unsaved scene changes");

    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    await waitFor(() => {
      expect(windowApiMock.destroy).toHaveBeenCalledTimes(1);
    });

    unmount();
    queryClient.clear();
  });

  it("reviews generated beats against the current outline and can insert selected beats before a chosen current beat", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      action: "scene-generate-beats",
      assistantMessage: "I tightened the beat progression around Ava's pressure.",
      result: {
        summary: "Five beats now track the scene's pressure turn by turn.",
        sceneProposals: [],
        beatOutline:
          "Ava clocks the checkpoint rhythm.\nA guard spots the false paperwork.\nRian improvises a distraction.\nAva chooses the bolder lie.\nThey pass, but the warning follows them.",
        manuscriptText: "",
      },
    });

    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Unsaved summary context should feed the beat generation." },
    });

    fireEvent.click(screen.getByRole("button", { name: /generate beats/i }));

    await waitFor(() => {
      expect(tauriApiMock.runStructuredAiAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: currentSnapshot.project.id,
          action: "scene-generate-beats",
          sceneId: "scene-1",
          workspaceContext: expect.stringContaining(
            "Unsaved summary context should feed the beat generation.",
          ),
        }),
      );
    });

    await screen.findByText("Generated Beat Outline");
    await screen.findByText("Current Beat Outline");
    await screen.findByText("Proposed Beat Outline");
    expect(
      screen.getByRole("button", { name: /replace with selected beats/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /at outline beginning/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /at outline end/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /beat 2/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /beat 4/i }));
    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "before" },
    });
    fireEvent.change(screen.getByLabelText(/before beat/i), {
      target: { value: "1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /insert selected beats/i }),
    );

    expect(
      (screen.getByLabelText(/beat outline/i) as HTMLTextAreaElement).value,
    ).toBe(
      "Ava meets the client at Dock Nine.\nAva clocks the checkpoint rhythm.\nRian improvises a distraction.\nThey pass, but the warning follows them.\nThe crate reacts to her touch.\nShe takes the job even though the setup feels wrong.",
    );
    expect(screen.getByRole("button", { name: /save planning/i })).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("lets the user cancel beat review without changing the current outline", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      action: "scene-generate-beats",
      assistantMessage: "I tightened the beat progression around Ava's pressure.",
      result: {
        summary: "Five beats now track the scene's pressure turn by turn.",
        sceneProposals: [],
        beatOutline:
          "Ava clocks the checkpoint rhythm.\nA guard spots the false paperwork.\nRian improvises a distraction.\nAva chooses the bolder lie.\nThey pass, but the warning follows them.",
        manuscriptText: "",
      },
    });

    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");
    const generateBeatsButton = await screen.findByRole("button", {
      name: /generate beats/i,
    });
    await waitFor(() => {
      expect((generateBeatsButton as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(generateBeatsButton);
    await waitFor(() => {
      expect(tauriApiMock.runStructuredAiAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: currentSnapshot.project.id,
          action: "scene-generate-beats",
          sceneId: "scene-1",
        }),
      );
    });
    await screen.findByText("Generated Beat Outline");

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText("Generated Beat Outline")).toBeNull();
    });
    expect((screen.getByLabelText(/beat outline/i) as HTMLTextAreaElement).value).toBe(
      "Ava meets the client at Dock Nine.\nThe crate reacts to her touch.\nShe takes the job even though the setup feels wrong.",
    );

    unmount();
    queryClient.clear();
  });

  it("reviews generated rough draft prose against the current draft and can insert selected blocks after a chosen current block", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      action: "scene-expand-draft",
      assistantMessage: "I expanded the beats into a short rough draft.",
      result: {
        summary: "A compact rough draft is ready for the scene workspace.",
        sceneProposals: [],
        beatOutline: "",
        manuscriptText:
          "<p>Ava counted the checkpoint lamps before she let herself breathe.</p><p>When the guard took the papers a second time, she smiled too fast and committed to the lie.</p>",
      },
    });

    const { queryClient, unmount } = renderSceneWorkspace();

    await screen.findByText("Scene Frame");
    const expandDraftButton = await screen.findByRole("button", {
      name: /expand to draft/i,
    });
    await waitFor(() => {
      expect((expandDraftButton as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(expandDraftButton);

    await waitFor(() => {
      expect(tauriApiMock.runStructuredAiAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: currentSnapshot.project.id,
          action: "scene-expand-draft",
          sceneId: "scene-1",
        }),
      );
    });

    await screen.findByText("Rough Draft Review");
    await screen.findByText("Current Draft");
    await screen.findByText("Proposed Draft");
    expect(
      screen.getByRole("button", { name: /replace with selected draft/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /at draft beginning/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /at draft end/i }),
    ).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("checkbox", { name: /block 1/i }));
    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "after" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /insert selected draft/i }),
    );

    expect(tiptapMock.editor.commands.setContent).toHaveBeenCalledWith(
      "<p>Ava hated jobs that breathed.</p><p>When the guard took the papers a second time, she smiled too fast and committed to the lie.</p><p>The crate pulsed once under her hand.</p>",
      false,
    );

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tauriApiMock.saveManuscript).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      manuscriptText:
        "<p>Ava hated jobs that breathed.</p><p>When the guard took the papers a second time, she smiled too fast and committed to the lie.</p><p>The crate pulsed once under her hand.</p>",
    });

    unmount();
    queryClient.clear();
  });
});
