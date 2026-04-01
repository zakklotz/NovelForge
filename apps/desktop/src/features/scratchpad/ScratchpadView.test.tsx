// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import { useUiStore } from "@/store/uiStore";
import { ScratchpadView } from "./ScratchpadView";

const tauriApiMock = vi.hoisted(() => ({
  getProjectSnapshot: vi.fn(),
  getAppSettings: vi.fn(),
  listRecommendedModels: vi.fn(),
  runScratchpadChat: vi.fn(),
  applyScratchpadResult: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  tauriApi: {
    createProject: vi.fn(),
    openProject: vi.fn(),
    restoreLastProject: vi.fn(),
    closeProject: vi.fn(),
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
    saveProjectState: vi.fn(),
    syncSuggestions: vi.fn(),
    getAppSettings: tauriApiMock.getAppSettings,
    saveAppSettings: vi.fn(),
    listRecommendedModels: tauriApiMock.listRecommendedModels,
    testProviderConnection: vi.fn(),
    runScratchpadChat: tauriApiMock.runScratchpadChat,
    applyScratchpadResult: tauriApiMock.applyScratchpadResult,
  },
}));

describe("ScratchpadView", () => {
  beforeEach(() => {
    useUiStore.getState().resetUi();
    useUiStore.setState({ currentProjectId: sampleProjectSnapshot.project.id });
    tauriApiMock.getProjectSnapshot.mockResolvedValue(sampleProjectSnapshot);
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
    tauriApiMock.listRecommendedModels.mockResolvedValue([
      {
        providerId: "gemini",
        modelId: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Default story planner",
      },
    ]);
    tauriApiMock.runScratchpadChat.mockResolvedValue({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      assistantMessage: {
        id: "assistant-1",
        role: "assistant",
        content: "I drafted one chapter proposal for you.",
        createdAt: "2026-03-15T00:00:00.000Z",
        action: "create-chapters",
      },
      result: {
        summary: "One chapter proposal ready.",
        chapters: [
          {
            targetChapterId: null,
            title: "Chapter 3: Stormglass",
            summary: "The crew follows the beacon inland.",
            purpose: "Escalate the mystery.",
            majorEvents: ["The beacon pulses"],
            emotionalMovement: "Curiosity to alarm",
            characterFocusIds: [],
            setupPayoffNotes: "The signal changes pitch near iron.",
          },
        ],
        scenes: [],
        characters: [],
        continuityNotes: [],
      },
    });
    tauriApiMock.applyScratchpadResult.mockResolvedValue({
      applied: [
        { kind: "chapter", id: "chapter-new", title: "Chapter 3: Stormglass" },
      ],
      events: [],
    });
  });

  it("runs a scratchpad request and applies the selected result", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ScratchpadView />
      </QueryClientProvider>,
    );

    await screen.findByText("Scratchpad");
    fireEvent.change(screen.getByPlaceholderText(/paste rough notes/i), {
      target: { value: "Turn this premise into an opening chapter." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send to scratchpad/i }));

    await waitFor(() => {
      expect(tauriApiMock.runScratchpadChat).toHaveBeenCalled();
    });

    await screen.findByText("Chapter 3: Stormglass");
    fireEvent.click(screen.getByRole("button", { name: /apply selected/i }));

    await waitFor(() => {
      expect(tauriApiMock.applyScratchpadResult).toHaveBeenCalled();
    });
  });
});
