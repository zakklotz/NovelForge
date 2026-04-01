// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveChapterInput, SetProjectMetadataInput } from "@novelforge/domain";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { AppRouter } from "@/router";
import { useUiStore } from "@/store/uiStore";

const tauriApiMock = vi.hoisted(() => ({
  restoreLastProject: vi.fn(),
  closeProject: vi.fn(),
  getProjectSnapshot: vi.fn(),
  setProjectMetadata: vi.fn(),
  saveChapter: vi.fn(),
  reorderChapters: vi.fn(),
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
    setProjectMetadata: tauriApiMock.setProjectMetadata,
    saveChapter: tauriApiMock.saveChapter,
    reorderChapters: tauriApiMock.reorderChapters,
    saveScene: vi.fn(),
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

function createChapter(id: string, title: string, orderIndex: number) {
  return {
    ...sampleProjectSnapshot.chapters[0],
    id,
    title,
    orderIndex,
    summary: `${title} summary`,
    purpose: `${title} purpose`,
  };
}

function createScene(
  id: string,
  chapterId: string,
  orderIndex: number,
  title: string,
) {
  return {
    ...sampleProjectSnapshot.scenes[0],
    id,
    chapterId,
    orderIndex,
    title,
    summary: `${title} summary`,
    purpose: `${title} purpose`,
  };
}

function createUnassignedScene(id: string, orderIndex: number, title: string) {
  return {
    ...sampleProjectSnapshot.scenes[0],
    id,
    chapterId: null,
    orderIndex,
    title,
    summary: `${title} summary`,
    purpose: `${title} purpose`,
  };
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

function moveSceneInSnapshot(
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
  const clampedTargetIndex = Math.max(0, Math.min(targetIndex, targetScenes.length));

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
        updatedAt: "2026-04-01T12:00:00.000Z",
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

function createStoryDiagnosticResponse() {
  return {
    providerId: "gemini",
    modelId: "gemini-2.5-flash",
    action: "story-diagnose-structure" as const,
    assistantMessage: "Reviewed the full story spine for planning gaps.",
    result: {
      summary: "Chapter 2 looks underdefined and the transition into the checkpoint is thin.",
      sceneProposals: [],
      beatOutline: "",
      manuscriptText: "",
      storyStructureDiagnostic: {
        underdefinedChapters: [
          {
            title: "Chapter 2 needs a clearer chapter-level turn",
            detail:
              "The pressure is present, but the chapter outcome still reads as a temporary obstacle instead of a structural shift.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [
              {
                kind: "scene",
                id: "scene-3",
                title: "Checkpoint Lanterns",
              },
            ],
          },
        ],
        redundantFunctions: [
          {
            title: "Opening scenes may overlap in revelation function",
            detail:
              "Both scenes in Chapter 1 center on Ava discovering the package is more dangerous than expected.",
            focus: {
              kind: "scene",
              id: "scene-1",
              title: "Dock Nine Exchange",
            },
            related: [
              {
                kind: "scene",
                id: "scene-2",
                title: "The Crate Speaks",
              },
            ],
          },
        ],
        missingTransitions: [
          {
            title: "Bridge the private revelation into the border pressure",
            detail:
              "A short consequence or prep beat may help carry the emotional handoff into Chapter 2.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [
              {
                kind: "scene",
                id: "scene-2",
                title: "The Crate Speaks",
              },
            ],
          },
        ],
        briefAlignmentNotes: [
          {
            alignment: "support",
            title: "Chapter 1 clearly supports the brief's premise",
            detail:
              "Ava taking possession of the package already gives the spine visible evidence of the reluctant-guardian setup.",
            focus: {
              kind: "chapter",
              id: "chapter-1",
              title: "Chapter 1: The Wrong Package",
            },
            related: [
              {
                kind: "scene",
                id: "scene-1",
                title: "Dock Nine Exchange",
              },
            ],
          },
          {
            alignment: "weak_support",
            title: "Chapter 2 only lightly supports the tonal promise",
            detail:
              "The checkpoint tension hints at the brief's wonder-struck danger, but the spine still gives that atmosphere limited room to breathe.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [],
          },
          {
            alignment: "risk",
            title: "Chapter 2 under-supports Ava's responsibility turn",
            detail:
              "The border material carries external pressure, but the current spine still gives limited support to the brief's stewardship-over-escape arc.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [
              {
                kind: "scene",
                id: "scene-3",
                title: "Checkpoint Lanterns",
              },
            ],
          },
        ],
        endingDirectionPreparation: [
          {
            title: "Chapter 2 is not yet preparing Ava's later stewardship choice",
            detail:
              "The checkpoint pressure escalates danger, but the spine still needs earlier groundwork for Ava choosing stewardship over escape by the ending.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [
              {
                kind: "scene",
                id: "scene-3",
                title: "Checkpoint Lanterns",
              },
            ],
          },
        ],
        setupPayoffSupport: [
          {
            title: "Chapter 2 only lightly seeds Rian's iron vulnerability payoff",
            detail:
              "The chapter notes imply Rian's iron pain should matter later, but the current spine still gives that thread limited visible groundwork.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [
              {
                kind: "scene",
                id: "scene-3",
                title: "Checkpoint Lanterns",
              },
            ],
          },
        ],
        actBalanceNotes: [
          {
            title: "The middle spine may be carrying too little development pressure",
            detail:
              "The opening load is clear, but the current chapter spread still looks light in the middle relative to the setup it launches and the later turns it suggests.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [
              {
                kind: "chapter",
                id: "chapter-1",
                title: "Chapter 1: The Wrong Package",
              },
            ],
          },
        ],
        nextPlanningTargets: [
          {
            title: "Clarify what Chapter 2 permanently changes",
            detail:
              "Define the irreversible turn before adding more scene material around the checkpoint.",
            focus: {
              kind: "chapter",
              id: "chapter-2",
              title: "Chapter 2: Border Sparks",
            },
            related: [],
          },
        ],
      },
    },
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
    tauriApiMock.setProjectMetadata.mockImplementation(
      async (input: SetProjectMetadataInput) => {
        const savedProject = {
          ...currentSnapshot.project,
          ...input,
          title: input.title.trim(),
          updatedAt: "2026-04-01T12:00:00.000Z",
        };
        currentSnapshot = {
          ...currentSnapshot,
          project: savedProject,
        };
        return savedProject;
      },
    );
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
    tauriApiMock.moveScene.mockImplementation(async (input) => {
      currentSnapshot = moveSceneInSnapshot(
        currentSnapshot,
        input.sceneId,
        input.targetChapterId ?? null,
        input.targetIndex,
      );

      return currentSnapshot.scenes.find((scene) => scene.id === input.sceneId)!;
    });
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

  it("edits and saves the top-level story brief from the story workspace", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Brief")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/^Premise/), {
      target: {
        value:
          "A disgraced smuggler becomes the only safe carrier for a living star-map.",
      },
    });
    fireEvent.change(screen.getByLabelText(/^Ending Direction/), {
      target: {
        value: "Land on a costly but hopeful ending where Ava chooses responsibility.",
      },
    });
    fireEvent.change(screen.getByLabelText(/^Tone/), {
      target: { value: "Tense, intimate, and wonder-struck." },
    });

    expect(screen.getByText("3 fields changed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save Story Brief" }));

    await waitFor(() => {
      expect(tauriApiMock.setProjectMetadata).toHaveBeenCalledWith({
        id: sampleProjectSnapshot.project.id,
        title: sampleProjectSnapshot.project.title,
        logline: sampleProjectSnapshot.project.logline,
        premise:
          "A disgraced smuggler becomes the only safe carrier for a living star-map.",
        centralConflict: sampleProjectSnapshot.project.centralConflict,
        thematicIntent: sampleProjectSnapshot.project.thematicIntent,
        endingDirection:
          "Land on a costly but hopeful ending where Ava chooses responsibility.",
        genre: sampleProjectSnapshot.project.genre,
        tone: "Tense, intimate, and wonder-struck.",
        audienceNotes: sampleProjectSnapshot.project.audienceNotes,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Brief is in sync")).toBeTruthy();
    });

    expect(currentSnapshot.project.premise).toBe(
      "A disgraced smuggler becomes the only safe carrier for a living star-map.",
    );
    expect(currentSnapshot.project.endingDirection).toBe(
      "Land on a costly but hopeful ending where Ava chooses responsibility.",
    );
    expect(currentSnapshot.project.tone).toBe("Tense, intimate, and wonder-struck.");

    unmount();
    queryClient.clear();
  });

  it("keeps unsaved story brief edits in place when the spine refreshes", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Brief")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/^Premise/), {
      target: {
        value: "A living map chooses the one courier least willing to protect it.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add Chapter",
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(3);
    });

    expect(
      (screen.getByLabelText(/^Premise/) as HTMLTextAreaElement).value,
    ).toBe("A living map chooses the one courier least willing to protect it.");
    expect(screen.getByText("1 field changed")).toBeTruthy();

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

  it("runs a story-level structure diagnostic review from the spine", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue(createStoryDiagnosticResponse());

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Analyze Story Structure",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Story Structure Review")).toBeTruthy();
    });

    expect(tauriApiMock.runStructuredAiAction).toHaveBeenCalledWith({
      projectId: sampleProjectSnapshot.project.id,
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      action: "story-diagnose-structure",
      workspaceContext: "",
    });
    expect(screen.getByText("Underdefined Chapters")).toBeTruthy();
    expect(screen.getByText("Redundant Functions")).toBeTruthy();
    expect(screen.getByText("Missing Transitions")).toBeTruthy();
    expect(screen.getByText("Story Brief Alignment")).toBeTruthy();
    expect(screen.getByText("Ending Direction Preparation")).toBeTruthy();
    expect(screen.getByText("Setup/Payoff Support")).toBeTruthy();
    expect(screen.getByText("Act Balance / Pacing")).toBeTruthy();
    expect(screen.getByText("Next Planning Targets")).toBeTruthy();
    expect(screen.getByText("Support")).toBeTruthy();
    expect(screen.getByText("Weak support")).toBeTruthy();
    expect(screen.getByText("Risk")).toBeTruthy();
    expect(screen.getByText("Chapter 1 clearly supports the brief's premise")).toBeTruthy();
    expect(screen.getByText("Chapter 2 needs a clearer chapter-level turn")).toBeTruthy();
    expect(screen.getByText("Chapter 2 under-supports Ava's responsibility turn")).toBeTruthy();
    expect(
      screen.getByText("Chapter 2 is not yet preparing Ava's later stewardship choice"),
    ).toBeTruthy();
    expect(
      screen.getByText("Chapter 2 only lightly seeds Rian's iron vulnerability payoff"),
    ).toBeTruthy();
    expect(
      screen.getByText("The middle spine may be carrying too little development pressure"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Chapter 2: Border Sparks" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Chapter 2 · Scene 1: Checkpoint Lanterns" }).length,
    ).toBeGreaterThan(0);

    unmount();
    queryClient.clear();
  });

  it("hides ending-direction preparation when the saved brief has no ending target", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      project: {
        ...currentSnapshot.project,
        endingDirection: "",
      },
    };

    const response = createStoryDiagnosticResponse();
    response.result.storyStructureDiagnostic.endingDirectionPreparation = [];
    tauriApiMock.runStructuredAiAction.mockResolvedValue(response);

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Analyze Story Structure",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Story Structure Review")).toBeTruthy();
    });

    expect(screen.queryByText("Ending Direction Preparation")).toBeNull();

    unmount();
    queryClient.clear();
  });

  it("keeps sparse brief diagnostic sections quiet when findings are intentionally empty", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      project: {
        ...currentSnapshot.project,
        logline: "",
        premise: "",
        centralConflict: "",
        thematicIntent: "",
        endingDirection: "",
        genre: "",
        tone: "",
        audienceNotes: "",
      },
    };

    const response = createStoryDiagnosticResponse();
    response.assistantMessage = "Reviewed the current spine for gaps.";
    response.result.summary = "No additional review notes surfaced from the sparse brief.";
    response.result.storyStructureDiagnostic = {
      underdefinedChapters: [],
      redundantFunctions: [],
      missingTransitions: [],
      briefAlignmentNotes: [],
      endingDirectionPreparation: [],
      setupPayoffSupport: [],
      actBalanceNotes: [],
      nextPlanningTargets: [],
    };
    tauriApiMock.runStructuredAiAction.mockResolvedValue(response);

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Analyze Story Structure",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Story Structure Review")).toBeTruthy();
    });

    expect(screen.getByText("0 review notes")).toBeTruthy();
    expect(screen.getByText("Story Brief Alignment")).toBeTruthy();
    expect(
      screen.getByText(
        "No meaningful story-brief support or risk notes surfaced in this review pass.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Setup/Payoff Support")).toBeTruthy();
    expect(
      screen.getByText("No setup/payoff support concerns surfaced in this review pass."),
    ).toBeTruthy();
    expect(screen.getByText("Act Balance / Pacing")).toBeTruthy();
    expect(
      screen.getByText("No broad act-balance or pacing concerns surfaced in this review pass."),
    ).toBeTruthy();
    expect(screen.queryByText("Ending Direction Preparation")).toBeNull();
    expect(screen.queryByText("Support")).toBeNull();
    expect(screen.queryByText("Risk")).toBeNull();

    unmount();
    queryClient.clear();
  });

  it("opens the chapter workspace from a diagnostic jump action", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue(createStoryDiagnosticResponse());

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Analyze Story Structure",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Story Structure Review")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Chapter 2: Border Sparks" })[0]);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/chapters/chapter-2");
    });

    expect(screen.getByText("Scene Plan")).toBeTruthy();
    const chapterWorkspacePanel = document.querySelector(
      "[data-jump-highlighted='true']",
    ) as HTMLElement | null;

    expect(useUiStore.getState().selectedChapterId).toBe("chapter-2");
    expect(
      within(chapterWorkspacePanel as HTMLElement).getByDisplayValue("Chapter 2: Border Sparks"),
    ).toBeTruthy();
    expect(chapterWorkspacePanel?.dataset.jumpHighlighted).toBe("true");
    expect(document.activeElement).toBe(chapterWorkspacePanel);

    unmount();
    queryClient.clear();
  });

  it("opens the scene workspace from a diagnostic jump action", async () => {
    tauriApiMock.runStructuredAiAction.mockResolvedValue(createStoryDiagnosticResponse());

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Analyze Story Structure",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Story Structure Review")).toBeTruthy();
    });

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Chapter 2 · Scene 1: Checkpoint Lanterns",
      })[0],
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/scenes/scene-3");
    });

    expect(screen.getByText("Scene Frame")).toBeTruthy();
    const sceneWorkspacePanel = document.querySelector(
      "[data-jump-highlighted='true']",
    ) as HTMLElement | null;

    expect(useUiStore.getState().selectedChapterId).toBe("chapter-2");
    expect(
      within(sceneWorkspacePanel as HTMLElement).getByDisplayValue("Checkpoint Lanterns"),
    ).toBeTruthy();
    expect(sceneWorkspacePanel?.dataset.jumpHighlighted).toBe("true");
    expect(document.activeElement).toBe(sceneWorkspacePanel);

    unmount();
    queryClient.clear();
  });

  it("shows scene planning gap diagnostics from chapter scene data", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: currentSnapshot.scenes.map((scene) =>
        scene.id === "scene-2"
          ? {
              ...scene,
              summary: "",
              purpose: "",
            }
          : scene,
      ),
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const firstChapterCard = screen.getAllByRole("article")[0];
    expect(within(firstChapterCard).getByText("Scene planning gaps")).toBeTruthy();
    expect(within(firstChapterCard).getByText("1 scene missing summary.")).toBeTruthy();
    expect(within(firstChapterCard).getByText("1 scene missing purpose.")).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("shows sparse and dense chapter load signals when the spine has enough mapped chapters", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      chapters: [
        createChapter("chapter-a", "Chapter A", 0),
        createChapter("chapter-b", "Chapter B", 1),
        createChapter("chapter-c", "Chapter C", 2),
        createChapter("chapter-d", "Chapter D", 3),
      ],
      scenes: [
        createScene("scene-a1", "chapter-a", 0, "Scene A1"),
        createScene("scene-b1", "chapter-b", 0, "Scene B1"),
        createScene("scene-b2", "chapter-b", 1, "Scene B2"),
        createScene("scene-b3", "chapter-b", 2, "Scene B3"),
        createScene("scene-c1", "chapter-c", 0, "Scene C1"),
        createScene("scene-c2", "chapter-c", 1, "Scene C2"),
        createScene("scene-c3", "chapter-c", 2, "Scene C3"),
        createScene("scene-d1", "chapter-d", 0, "Scene D1"),
        createScene("scene-d2", "chapter-d", 1, "Scene D2"),
        createScene("scene-d3", "chapter-d", 2, "Scene D3"),
        createScene("scene-d4", "chapter-d", 3, "Scene D4"),
        createScene("scene-d5", "chapter-d", 4, "Scene D5"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const chapterCards = screen.getAllByRole("article");
    expect(within(chapterCards[0]).getByText("Sparse for current spine")).toBeTruthy();
    expect(
      within(chapterCards[0]).getByText(
        "1 scene here while the current spine usually lands around 3.",
      ),
    ).toBeTruthy();
    expect(within(chapterCards[3]).getByText("Dense for current spine")).toBeTruthy();
    expect(
      within(chapterCards[3]).getByText(
        "5 scenes here while the current spine usually lands around 3.",
      ),
    ).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("shows unassigned scenes as a first-class story spine bucket", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned", 0, "Ashfall Detour"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    expect(
      screen.getByText(
        "A deliberate holding area for scenes that belong in the plan, but are not yet placed on the chapter spine.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Ashfall Detour")).toBeTruthy();
    expect(screen.getByText("Unassigned scene 1")).toBeTruthy();

    unmount();
    queryClient.clear();
  });

  it("opens an unassigned scene from the story spine bucket", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned", 0, "Ashfall Detour"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Ashfall Detour" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/scenes/scene-unassigned");
    });

    expect(screen.getByText("Scene Frame")).toBeTruthy();
    expect(useUiStore.getState().selectedChapterId).toBeNull();

    unmount();
    queryClient.clear();
  });

  it("reorders unassigned scenes through the backend move command", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned-1", 0, "Ashfall Detour"),
        createUnassignedScene("scene-unassigned-2", 1, "Glass Harbor"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move ashfall detour later in unassigned/i,
      }),
    );

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-unassigned-1",
      targetChapterId: null,
      targetIndex: 2,
    });

    await waitFor(() => {
      const firstScene = screen.getByText("Glass Harbor");
      const secondScene = screen.getByText("Ashfall Detour");
      expect(
        firstScene.compareDocumentPosition(secondScene) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    unmount();
    queryClient.clear();
  });

  it("moves an unassigned scene into a chapter end by default through the backend move command", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned", 0, "Ashfall Detour"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/move into chapter/i), {
      target: { value: "chapter-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move to Chapter" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-unassigned",
      targetChapterId: "chapter-2",
      targetIndex: 1,
    });

    await waitFor(() => {
      expect(screen.queryByText("Unassigned Scenes")).toBeNull();
    });

    unmount();
    queryClient.clear();
  });

  it("moves an unassigned scene to chapter beginning through the backend move command", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned", 0, "Ashfall Detour"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/move into chapter/i), {
      target: { value: "chapter-2" },
    });
    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "start" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move to Chapter" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-unassigned",
      targetChapterId: "chapter-2",
      targetIndex: 0,
    });

    unmount();
    queryClient.clear();
  });

  it("moves an unassigned scene after a selected chapter scene through the backend move command", async () => {
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
          summary: "A second chapter scene gives the move flow a middle insertion point.",
          purpose: "Hold the line after the checkpoint.",
          dependencySceneIds: ["scene-3"],
        },
        createUnassignedScene("scene-unassigned", 0, "Ashfall Detour"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/move into chapter/i), {
      target: { value: "chapter-2" },
    });
    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "after" },
    });
    fireEvent.change(screen.getByLabelText(/after scene/i), {
      target: { value: "scene-3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move to Chapter" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-unassigned",
      targetChapterId: "chapter-2",
      targetIndex: 1,
    });

    unmount();
    queryClient.clear();
  });

  it("keeps unsaved story brief edits in place when moving an unassigned scene refreshes the snapshot", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned", 0, "Ashfall Detour"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Brief")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/^Premise/), {
      target: {
        value: "A courier keeps one scene off the spine while the brief keeps changing.",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Move to Chapter" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect((screen.getByLabelText(/^Premise/) as HTMLTextAreaElement).value).toBe(
      "A courier keeps one scene off the spine while the brief keeps changing.",
    );

    unmount();
    queryClient.clear();
  });

  it("reorders a chapter scene later within the same chapter through the backend move command", async () => {
    const secondChapterOneScene = currentSnapshot.scenes.find(
      (scene) => scene.id === "scene-2",
    );
    if (!secondChapterOneScene) {
      throw new Error("Expected second chapter-1 scene in sample project.");
    }

    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        {
          ...secondChapterOneScene,
          id: "scene-1b",
          orderIndex: 2,
          title: "Signal Ledger",
          summary: "A third chapter scene gives Story Spine a visible same-chapter reorder target.",
          purpose: "Hold the chapter open a little longer.",
          dependencySceneIds: ["scene-2"],
        },
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange later in chapter 1: the wrong package/i,
      }),
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

    unmount();
    queryClient.clear();
  });

  it("reorders a chapter scene earlier within the same chapter through the backend move command", async () => {
    const secondChapterOneScene = currentSnapshot.scenes.find(
      (scene) => scene.id === "scene-2",
    );
    if (!secondChapterOneScene) {
      throw new Error("Expected second chapter-1 scene in sample project.");
    }

    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        {
          ...secondChapterOneScene,
          id: "scene-1b",
          orderIndex: 2,
          title: "Signal Ledger",
          summary: "A third chapter scene gives Story Spine a visible same-chapter reorder target.",
          purpose: "Hold the chapter open a little longer.",
          dependencySceneIds: ["scene-2"],
        },
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move signal ledger earlier in chapter 1: the wrong package/i,
      }),
    );

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1b",
      targetChapterId: "chapter-1",
      targetIndex: 1,
    });

    unmount();
    queryClient.clear();
  });

  it("keeps unsaved story brief edits in place when reordering a chapter scene refreshes the snapshot", async () => {
    const secondChapterOneScene = currentSnapshot.scenes.find(
      (scene) => scene.id === "scene-2",
    );
    if (!secondChapterOneScene) {
      throw new Error("Expected second chapter-1 scene in sample project.");
    }

    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        {
          ...secondChapterOneScene,
          id: "scene-1b",
          orderIndex: 2,
          title: "Signal Ledger",
          summary: "A third chapter scene gives Story Spine a visible same-chapter reorder target.",
          purpose: "Hold the chapter open a little longer.",
          dependencySceneIds: ["scene-2"],
        },
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Brief")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/^Premise/), {
      target: {
        value: "A courier reorders one chapter scene while the top-level brief keeps changing.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange later in chapter 1: the wrong package/i,
      }),
    );

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect((screen.getByLabelText(/^Premise/) as HTMLTextAreaElement).value).toBe(
      "A courier reorders one chapter scene while the top-level brief keeps changing.",
    );

    unmount();
    queryClient.clear();
  });

  it("moves a chapter scene into another chapter end by default through the backend move command", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Scene" }));

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

  it("moves a chapter scene before a selected target chapter scene through the backend move command", async () => {
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
          summary: "A second chapter scene gives Story Spine a second insertion anchor.",
          purpose: "Hold the line after the checkpoint.",
          dependencySceneIds: ["scene-3"],
        },
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );
    fireEvent.change(screen.getByLabelText(/insert position/i), {
      target: { value: "before" },
    });
    fireEvent.change(screen.getByLabelText(/before scene/i), {
      target: { value: "scene-4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move Scene" }));

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

  it("keeps unsaved story brief edits in place when moving a chapter scene refreshes the snapshot", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Brief")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/^Premise/), {
      target: {
        value: "A courier shifts one chapter scene while the top-level spine intent keeps changing.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Scene" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect((screen.getByLabelText(/^Premise/) as HTMLTextAreaElement).value).toBe(
      "A courier shifts one chapter scene while the top-level spine intent keeps changing.",
    );

    unmount();
    queryClient.clear();
  });

  it("moves a chapter scene to unassigned through the backend move command", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter or unassigned/i,
      }),
    );
    fireEvent.change(screen.getByLabelText(/move destination/i), {
      target: { value: "__unassigned__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move Scene" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      targetChapterId: null,
      targetIndex: 0,
    });

    await waitFor(() => {
      expect(screen.getByText("Unassigned Scenes")).toBeTruthy();
    });

    unmount();
    queryClient.clear();
  });

  it("moves a chapter scene after a selected unassigned scene through the backend move command", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      scenes: [
        ...currentSnapshot.scenes,
        createUnassignedScene("scene-unassigned-1", 0, "Ashfall Detour"),
        createUnassignedScene("scene-unassigned-2", 1, "Glass Harbor"),
      ],
    };

    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Spine")).toBeTruthy();
    });

    const moveButton = screen.getByRole("button", {
      name: /move dock nine exchange to another chapter or unassigned/i,
    });
    const sceneCard = moveButton.closest("div.rounded-2xl");
    if (!(sceneCard instanceof HTMLElement)) {
      throw new Error("Expected Story Spine scene card for Dock Nine Exchange.");
    }

    fireEvent.click(
      within(sceneCard).getByRole("button", {
        name: /move dock nine exchange to another chapter or unassigned/i,
      }),
    );
    fireEvent.change(within(sceneCard).getByLabelText(/move destination/i), {
      target: { value: "__unassigned__" },
    });
    fireEvent.change(within(sceneCard).getByLabelText(/insert position/i), {
      target: { value: "after" },
    });
    fireEvent.change(within(sceneCard).getByLabelText(/after scene/i), {
      target: { value: "scene-unassigned-1" },
    });
    fireEvent.click(within(sceneCard).getByRole("button", { name: "Move Scene" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect(tauriApiMock.moveScene).toHaveBeenCalledWith({
      projectId: currentSnapshot.project.id,
      sceneId: "scene-1",
      targetChapterId: null,
      targetIndex: 1,
    });

    unmount();
    queryClient.clear();
  });

  it("keeps unsaved story brief edits in place when moving a chapter scene to unassigned refreshes the snapshot", async () => {
    const { queryClient, unmount } = renderRouter();

    await waitFor(() => {
      expect(screen.getByText("Story Brief")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/^Premise/), {
      target: {
        value: "A courier moves one chapter scene back to unassigned while the top-level brief keeps changing.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /move dock nine exchange to another chapter or unassigned/i,
      }),
    );
    fireEvent.change(screen.getByLabelText(/move destination/i), {
      target: { value: "__unassigned__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move Scene" }));

    await waitFor(() => {
      expect(tauriApiMock.moveScene).toHaveBeenCalledTimes(1);
    });

    expect((screen.getByLabelText(/^Premise/) as HTMLTextAreaElement).value).toBe(
      "A courier moves one chapter scene back to unassigned while the top-level brief keeps changing.",
    );

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
        name: /open dock nine exchange/i,
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
