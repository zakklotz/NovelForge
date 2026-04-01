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
  moveScene: vi.fn(),
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
    reorderChapters: vi.fn(),
    saveScene: tauriApiMock.saveScene,
    moveScene: tauriApiMock.moveScene,
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

function moveSceneWithinChapterSnapshot(
  snapshot: typeof sampleProjectSnapshot,
  sceneId: string,
  targetChapterId: string | null,
  targetIndex: number,
) {
  const movingScene = snapshot.scenes.find((scene) => scene.id === sceneId);
  if (!movingScene) {
    throw new Error(`Scene ${sceneId} not found.`);
  }

  const sourceChapterId = movingScene.chapterId ?? null;
  const bucketIds = Array.from(new Set([sourceChapterId, targetChapterId]));
  const scenesByBucket = new Map(
    bucketIds.map((chapterId) => [
      chapterId,
      snapshot.scenes
        .filter(
          (scene) => (scene.chapterId ?? null) === chapterId && scene.id !== sceneId,
        )
        .sort((left, right) => left.orderIndex - right.orderIndex),
    ]),
  );
  const targetScenes = [...(scenesByBucket.get(targetChapterId) ?? [])];
  const clampedTargetIndex = Math.max(
    0,
    Math.min(targetIndex, targetScenes.length),
  );

  targetScenes.splice(clampedTargetIndex, 0, {
    ...movingScene,
    chapterId: targetChapterId,
  });
  scenesByBucket.set(targetChapterId, targetScenes);

  const updatedScenesById = new Map<string, (typeof snapshot.scenes)[number]>();
  for (const scenes of scenesByBucket.values()) {
    scenes.forEach((scene, index) => {
      updatedScenesById.set(scene.id, {
        ...scene,
        orderIndex: index,
        updatedAt: "2026-03-31T12:00:00.000Z",
      });
    });
  }

  return {
    ...snapshot,
    scenes: snapshot.scenes.map((scene) =>
      updatedScenesById.get(scene.id) ?? scene,
    ),
  };
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

    tauriApiMock.moveScene.mockImplementation(async (input) => {
      currentSnapshot = moveSceneWithinChapterSnapshot(
        currentSnapshot,
        input.sceneId,
        input.targetChapterId ?? null,
        input.targetIndex,
      );

      return currentSnapshot.scenes.find((scene) => scene.id === input.sceneId)!;
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

  it("reorders chapter scenes inline through the backend move command", async () => {
    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /move dock nine exchange later/i }),
    );

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      targetChapterId: "chapter-1",
      targetIndex: 2,
    });

    await waitFor(() => {
      const firstScene = screen.getByText("The Crate Speaks");
      const secondScene = screen.getByText("Dock Nine Exchange");
      expect(
        firstScene.compareDocumentPosition(secondScene) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    unmount();
    queryClient.clear();
  });

  it("moves a scene to a different chapter and inserts at chapter end by default", async () => {
    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );

    expect(
      screen.getByDisplayValue("Chapter 2: Border Sparks"),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("At chapter end")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^move scene$/i }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      targetChapterId: "chapter-2",
      targetIndex: 1,
    });

    await waitFor(() => {
      expect(screen.queryByText("Dock Nine Exchange")).toBeNull();
    });
    expect(screen.getByText("The Crate Speaks")).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("moves a scene to the beginning of a different chapter through the backend move command", async () => {
    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );

    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "start" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^move scene$/i }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      targetChapterId: "chapter-2",
      targetIndex: 0,
    });

    unmount();
    queryClient.clear();
  });

  it("moves a scene after a selected target scene through the backend move command", async () => {
    const targetAnchor = currentSnapshot.scenes.find((scene) => scene.id === "scene-3");
    if (!targetAnchor) {
      throw new Error("Expected chapter 2 anchor scene in sample project.");
    }

    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        {
          ...targetAnchor,
          id: "scene-4",
          orderIndex: 1,
          title: "Signal Fire",
          summary: "A second target scene gives the move flow a middle insertion point.",
          purpose: "Hold the line after the border check.",
          dependencySceneIds: ["scene-3"],
        },
      ],
    };

    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );

    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "after" },
    });
    fireEvent.change(screen.getByLabelText(/after scene/i), {
      target: { value: "scene-3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^move scene$/i }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      targetChapterId: "chapter-2",
      targetIndex: 1,
    });

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

  it("keeps unsaved chapter edits in place when reordering a scene refreshes the snapshot", async () => {
    const { unmount, queryClient } = renderRouter();

    const summaryPlaceholder = "Summarize the chapter's visible movement.";
    await waitFor(() => {
      expect(screen.getByPlaceholderText(summaryPlaceholder)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(summaryPlaceholder), {
      target: {
        value: "Ava reframes the whole chapter before the scenes shift under her.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /move dock nine exchange later/i }),
    );

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const firstScene = screen.getByText("The Crate Speaks");
      const secondScene = screen.getByText("Dock Nine Exchange");
      expect(
        firstScene.compareDocumentPosition(secondScene) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    expect(
      (screen.getByPlaceholderText(summaryPlaceholder) as HTMLTextAreaElement).value,
    ).toBe("Ava reframes the whole chapter before the scenes shift under her.");

    unmount();
    queryClient.clear();
  });

  it("keeps unsaved chapter edits in place when moving a scene to another chapter refreshes the snapshot", async () => {
    const { unmount, queryClient } = renderRouter();

    const summaryPlaceholder = "Summarize the chapter's visible movement.";
    await waitFor(() => {
      expect(screen.getByPlaceholderText(summaryPlaceholder)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(summaryPlaceholder), {
      target: {
        value: "Ava reframes the chapter while one scene gets promoted into the next chapter.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^move scene$/i }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByText("Dock Nine Exchange")).toBeNull();
    });

    expect(
      (screen.getByPlaceholderText(summaryPlaceholder) as HTMLTextAreaElement).value,
    ).toBe(
      "Ava reframes the chapter while one scene gets promoted into the next chapter.",
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

  it("reviews proposed scenes before inserting them into the chapter", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      action: "chapter-propose-scenes",
      assistantMessage: "I proposed two scenes that tighten the chapter escalation.",
      result: {
        summary: "Two new scenes bridge the chapter's commitment and fallout.",
        sceneProposals: [
          {
            targetSceneId: null,
            chapterId: "chapter-1",
            chapterTitleHint: null,
            title: "Dock Nine Exchange",
            summary: "Ava meets the client again under a new layer of pressure.",
            purpose: "Escalate the chapter's pressure.",
            beatOutline: "Alarm sounds\nAva improvises\nThe threat retreats for now",
            conflict: "A guard notices the wrong detail.",
            outcome: "Ava buys a little more time.",
            povCharacterId: "char-ava",
            location: "Harbor checkpoint",
            timeLabel: "Predawn",
            involvedCharacterIds: ["char-ava", "char-rian"],
            continuityTags: ["inspection"],
            dependencySceneIds: ["scene-2"],
            manuscriptText: "<p></p>",
          },
          {
            targetSceneId: null,
            chapterId: "chapter-1",
            chapterTitleHint: null,
            title: "Safehouse Bargain",
            summary: "Rian trades part of the truth for Ava's continued help.",
            purpose: "Reframe the alliance before the chapter closes.",
            beatOutline: "They reach shelter\nRian admits a limit\nAva stays for her own reasons",
            conflict: "Ava wants honesty while Rian wants control.",
            outcome: "They keep moving together, but with new terms.",
            povCharacterId: "char-ava",
            location: "Abandoned watchtower",
            timeLabel: "Before dawn",
            involvedCharacterIds: ["char-ava", "char-rian"],
            continuityTags: ["alliance"],
            dependencySceneIds: ["scene-2"],
            manuscriptText: "<p></p>",
          },
        ],
        beatOutline: "",
        manuscriptText: "",
      },
    });

    const { unmount, queryClient } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Scene Plan")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Summarize the chapter's visible movement."), {
      target: {
        value: "Unsaved chapter context should still inform the scene proposals.",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /propose scenes/i }));

    await waitFor(() => {
      expect(tauriApiMock.runStructuredAiAction).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: currentSnapshot.project.id,
          action: "chapter-propose-scenes",
          chapterId: "chapter-1",
          workspaceContext: expect.stringContaining(
            "Unsaved chapter context should still inform the scene proposals.",
          ),
        }),
      );
    });

    await screen.findByText("Scene Proposals");
    await screen.findByText('Likely duplicates "Dock Nine Exchange".');
    expect(tauriApiMock.saveScene).not.toHaveBeenCalled();

    fireEvent.change(screen.getByDisplayValue("Safehouse Bargain"), {
      target: {
        value: "Safehouse Terms",
      },
    });
    fireEvent.change(
      screen.getByDisplayValue("Rian trades part of the truth for Ava's continued help."),
      {
        target: {
          value: "Ava rewrites the alliance after calling Rian's bluff.",
        },
      },
    );
    fireEvent.change(
      screen.getByDisplayValue("Reframe the alliance before the chapter closes."),
      {
        target: {
          value: "Lock in the alliance on sharper terms.",
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /remove dock nine exchange/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert selected/i }));

    await waitFor(() => {
      expect(tauriApiMock.saveScene).toHaveBeenCalledTimes(1);
    });
    expect(tauriApiMock.saveScene).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: "chapter-1",
        title: "Safehouse Terms",
        summary: "Ava rewrites the alliance after calling Rian's bluff.",
        purpose: "Lock in the alliance on sharper terms.",
      }),
    );

    await screen.findByText("Inserted 1 proposed scene into this chapter.");

    unmount();
    queryClient.clear();
  });
});
