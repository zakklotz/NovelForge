// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";

const tauriApiMock = vi.hoisted(() => ({
  getAppSettings: vi.fn(),
  saveAppSettings: vi.fn(),
  listRecommendedModels: vi.fn(),
  testProviderConnection: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  tauriApi: {
    createProject: vi.fn(),
    openProject: vi.fn(),
    restoreLastProject: vi.fn(),
    closeProject: vi.fn(),
    getProjectSnapshot: vi.fn(),
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
    saveAppSettings: tauriApiMock.saveAppSettings,
    listRecommendedModels: tauriApiMock.listRecommendedModels,
    testProviderConnection: tauriApiMock.testProviderConnection,
    runScratchpadChat: vi.fn(),
    runStructuredAiAction: vi.fn(),
    applyScratchpadResult: vi.fn(),
  },
}));

describe("SettingsView", () => {
  beforeEach(() => {
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
    tauriApiMock.saveAppSettings.mockImplementation(async ({ ai }) => ({
      ai: {
        defaultProvider: ai.defaultProvider,
        providers: {
          gemini: {
            enabled: ai.providers.gemini.enabled,
            hasApiKey: true,
            defaultModel: ai.providers.gemini.defaultModel,
          },
          groq: {
            enabled: ai.providers.groq.enabled,
            hasApiKey: false,
            defaultModel: ai.providers.groq.defaultModel,
          },
          openrouter: {
            enabled: ai.providers.openrouter.enabled,
            hasApiKey: false,
            defaultModel: ai.providers.openrouter.defaultModel,
          },
        },
      },
    }));
    tauriApiMock.testProviderConnection.mockResolvedValue({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      success: true,
      message: "Provider responded successfully: ok",
    });
  });

  it("keeps the typed key in place after saving app-level provider settings", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <SettingsView />
      </QueryClientProvider>,
    );

    await screen.findByText("AI Settings");
    const apiKeyInputs = container.querySelectorAll('input[type="password"]');
    fireEvent.change(apiKeyInputs[0] as HTMLInputElement, {
      target: { value: "gemini-test-key" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save ai settings/i }));

    await waitFor(() => {
      expect(tauriApiMock.saveAppSettings).toHaveBeenCalledWith({
        ai: expect.objectContaining({
          defaultProvider: "gemini",
          providers: expect.objectContaining({
            gemini: expect.objectContaining({
              apiKey: "gemini-test-key",
              defaultModel: "gemini-2.5-flash",
              enabled: true,
            }),
          }),
        }),
      });
    });
    expect(screen.getByDisplayValue("gemini-test-key")).toBeTruthy();
  });
});
