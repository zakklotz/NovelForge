import { useQueryClient } from "@tanstack/react-query";
import type {
  AppSettings,
  ApplyScratchpadResultInput,
  ApplyScratchpadResultOutput,
  ProviderConnectionResult,
  RunScratchpadChatInput,
  RunStructuredAiActionInput,
  SaveAppSettingsInput,
  ScratchpadChatResponse,
  StructuredAiResponse,
  TestProviderConnectionInput,
} from "@novelforge/domain";
import { tauriApi } from "@/lib/tauri";
import { useUiStore } from "@/store/uiStore";

export function useAiRuntime() {
  const queryClient = useQueryClient();
  const currentProjectId = useUiStore((state) => state.currentProjectId);
  const enqueueAnalysis = useUiStore((state) => state.enqueueAnalysis);

  async function refreshProjectSnapshot() {
    if (!currentProjectId) {
      return null;
    }

    const snapshot = await tauriApi.getProjectSnapshot();
    queryClient.setQueryData(["projectSnapshot", currentProjectId], snapshot);
    return snapshot;
  }

  async function saveAppSettings(input: SaveAppSettingsInput) {
    const settings = await tauriApi.saveAppSettings(input);
    queryClient.setQueryData<AppSettings>(["appSettings"], settings);
    return settings;
  }

  async function testProviderConnection(input: TestProviderConnectionInput) {
    return tauriApi.testProviderConnection(input) as Promise<ProviderConnectionResult>;
  }

  async function runScratchpadChat(input: RunScratchpadChatInput) {
    return tauriApi.runScratchpadChat(input) as Promise<ScratchpadChatResponse>;
  }

  async function runStructuredAiAction(input: RunStructuredAiActionInput) {
    return tauriApi.runStructuredAiAction(input) as Promise<StructuredAiResponse>;
  }

  async function applyScratchpadResult(input: ApplyScratchpadResultInput) {
    const output =
      (await tauriApi.applyScratchpadResult(input)) as ApplyScratchpadResultOutput;
    await refreshProjectSnapshot();
    output.events.forEach((event) => enqueueAnalysis(event));
    return output;
  }

  return {
    refreshProjectSnapshot,
    saveAppSettings,
    testProviderConnection,
    runScratchpadChat,
    runStructuredAiAction,
    applyScratchpadResult,
  };
}
