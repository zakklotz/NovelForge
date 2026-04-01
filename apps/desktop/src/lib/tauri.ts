import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  ApplyScratchpadResultInput,
  ApplyScratchpadResultOutput,
  Chapter,
  Character,
  CreateProjectInput,
  MoveSceneInput,
  OpenProjectInput,
  ProviderConnectionResult,
  ProjectSnapshot,
  ProjectState,
  RecommendedModel,
  RunScratchpadChatInput,
  SaveChapterInput,
  SaveAppSettingsInput,
  SaveCharacterInput,
  SaveManuscriptInput,
  SaveSceneInput,
  ScratchpadChatResponse,
  Suggestion,
  TestProviderConnectionInput,
  UpdateSuggestionStatusInput,
} from "@novelforge/domain";

interface SyncSuggestionsInput {
  projectId: string;
  triggerEvent: string;
  suggestions: Suggestion[];
}

export const tauriApi = {
  createProject: (input: CreateProjectInput) =>
    invoke<ProjectSnapshot>("create_project", { input }),
  openProject: (input: OpenProjectInput) =>
    invoke<ProjectSnapshot>("open_project", { input }),
  restoreLastProject: () =>
    invoke<ProjectSnapshot | null>("restore_last_project"),
  closeProject: () => invoke<void>("close_project"),
  getProjectSnapshot: () =>
    invoke<ProjectSnapshot>("get_project_snapshot"),
  saveChapter: (input: SaveChapterInput) =>
    invoke<Chapter>("save_chapter", { input }),
  reorderChapters: (projectId: string, chapterIds: string[]) =>
    invoke<void>("reorder_chapters", { projectId, chapterIds }),
  saveScene: (input: SaveSceneInput) => invoke("save_scene", { input }),
  moveScene: (input: MoveSceneInput) => invoke("move_scene", { input }),
  saveManuscript: (input: SaveManuscriptInput) =>
    invoke("save_manuscript", { input }),
  saveCharacter: (input: SaveCharacterInput) =>
    invoke<Character>("save_character", { input }),
  listSuggestions: () => invoke<Suggestion[]>("list_suggestions"),
  applySuggestion: (input: UpdateSuggestionStatusInput) =>
    invoke<void>("apply_suggestion", { input }),
  dismissSuggestion: (input: UpdateSuggestionStatusInput) =>
    invoke<void>("dismiss_suggestion", { input }),
  saveProjectState: (projectState: ProjectState) =>
    invoke<ProjectState>("save_project_state", { projectState }),
  syncSuggestions: (input: SyncSuggestionsInput) =>
    invoke<Suggestion[]>("sync_suggestions", { input }),
  getAppSettings: () => invoke<AppSettings>("get_app_settings"),
  saveAppSettings: (input: SaveAppSettingsInput) =>
    invoke<AppSettings>("save_app_settings", { input }),
  listRecommendedModels: (providerId?: string) =>
    invoke<RecommendedModel[]>("list_recommended_models", { providerId }),
  testProviderConnection: (input: TestProviderConnectionInput) =>
    invoke<ProviderConnectionResult>("test_provider_connection", { input }),
  runScratchpadChat: (input: RunScratchpadChatInput) =>
    invoke<ScratchpadChatResponse>("run_scratchpad_chat", { input }),
  applyScratchpadResult: (input: ApplyScratchpadResultInput) =>
    invoke<ApplyScratchpadResultOutput>("apply_scratchpad_result", { input }),
};
