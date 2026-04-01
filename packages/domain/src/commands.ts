import { z } from "zod";
import {
  aiProviderIdSchema,
  chapterSchema,
  characterSchema,
  projectStateSchema,
  scratchpadActionSchema,
  scratchpadMessageSchema,
  scratchpadProjectContextSchema,
  scratchpadResultSchema,
  sceneSchema,
  structuredAiActionSchema,
  suggestionStatusSchema,
} from "./models";

export const createProjectInputSchema = z.object({
  title: z.string().min(1),
  logline: z.string().default(""),
  path: z.string(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const openProjectInputSchema = z.object({
  path: z.string(),
});

export type OpenProjectInput = z.infer<typeof openProjectInputSchema>;

export const saveChapterInputSchema = chapterSchema.pick({
  id: true,
  projectId: true,
  title: true,
  summary: true,
  purpose: true,
  majorEvents: true,
  emotionalMovement: true,
  characterFocusIds: true,
  setupPayoffNotes: true,
  orderIndex: true,
});

export type SaveChapterInput = z.infer<typeof saveChapterInputSchema>;

export const reorderChaptersInputSchema = z.object({
  projectId: z.string(),
  chapterIds: z.array(z.string()),
});

export type ReorderChaptersInput = z.infer<typeof reorderChaptersInputSchema>;

export const saveSceneInputSchema = sceneSchema.pick({
  id: true,
  projectId: true,
  chapterId: true,
  orderIndex: true,
  title: true,
  summary: true,
  purpose: true,
  beatOutline: true,
  conflict: true,
  outcome: true,
  povCharacterId: true,
  location: true,
  timeLabel: true,
  involvedCharacterIds: true,
  continuityTags: true,
  dependencySceneIds: true,
  manuscriptText: true,
});

export type SaveSceneInput = z.infer<typeof saveSceneInputSchema>;

export const moveSceneInputSchema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
  targetChapterId: z.string().nullable(),
  targetIndex: z.number().int().nonnegative(),
});

export type MoveSceneInput = z.infer<typeof moveSceneInputSchema>;

export const saveManuscriptInputSchema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
  manuscriptText: z.string(),
});

export type SaveManuscriptInput = z.infer<typeof saveManuscriptInputSchema>;

export const saveCharacterInputSchema = characterSchema.pick({
  id: true,
  projectId: true,
  name: true,
  role: true,
  personalityTraits: true,
  motivations: true,
  fears: true,
  worldview: true,
  speakingStyle: true,
  vocabularyTendencies: true,
  speechRhythm: true,
  emotionalBaseline: true,
  relationships: true,
  secrets: true,
  arcDirection: true,
  contradictions: true,
});

export type SaveCharacterInput = z.infer<typeof saveCharacterInputSchema>;

export const runImpactAnalysisInputSchema = z.object({
  projectId: z.string(),
  eventType: z.string(),
  entityId: z.string().nullable().default(null),
});

export type RunImpactAnalysisInput = z.infer<typeof runImpactAnalysisInputSchema>;

const aiProviderSettingsInputSchema = z.object({
  enabled: z.boolean(),
  defaultModel: z.string().min(1),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().default(false),
});

export const saveAppSettingsInputSchema = z.object({
  ai: z.object({
    defaultProvider: aiProviderIdSchema,
    providers: z.object({
      gemini: aiProviderSettingsInputSchema,
      groq: aiProviderSettingsInputSchema,
      openrouter: aiProviderSettingsInputSchema,
    }),
  }),
});

export type SaveAppSettingsInput = z.infer<typeof saveAppSettingsInputSchema>;

export const getAppSettingsInputSchema = z.object({}).default({});

export type GetAppSettingsInput = z.infer<typeof getAppSettingsInputSchema>;

export const listRecommendedModelsInputSchema = z.object({
  providerId: aiProviderIdSchema.optional(),
});

export type ListRecommendedModelsInput = z.infer<
  typeof listRecommendedModelsInputSchema
>;

export const testProviderConnectionInputSchema = z.object({
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  apiKeyOverride: z.string().optional(),
});

export type TestProviderConnectionInput = z.infer<
  typeof testProviderConnectionInputSchema
>;

export const runScratchpadChatInputSchema = z.object({
  projectId: z.string(),
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  action: scratchpadActionSchema,
  sessionId: z.string(),
  sessionTitle: z.string().min(1),
  messages: z.array(scratchpadMessageSchema).default([]),
  userInput: z.string().min(1),
  projectContext: scratchpadProjectContextSchema.default({
    chapterIds: [],
    sceneIds: [],
    characterIds: [],
  }),
});

export type RunScratchpadChatInput = z.infer<typeof runScratchpadChatInputSchema>;

export const runStructuredAiActionInputSchema = z.object({
  projectId: z.string(),
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  action: structuredAiActionSchema,
  chapterId: z.string().optional(),
  sceneId: z.string().optional(),
  workspaceContext: z.string().default(""),
});

export type RunStructuredAiActionInput = z.infer<
  typeof runStructuredAiActionInputSchema
>;

export const applyScratchpadResultInputSchema = z.object({
  projectId: z.string(),
  result: scratchpadResultSchema,
});

export type ApplyScratchpadResultInput = z.infer<
  typeof applyScratchpadResultInputSchema
>;

const suggestionCommandInputSchema = z.object({
  projectId: z.string(),
  suggestionId: z.string(),
});

export const applySuggestionInputSchema = suggestionCommandInputSchema.extend({
  status: z.literal("applied").default("applied"),
});

export type ApplySuggestionInput = z.infer<typeof applySuggestionInputSchema>;

export const dismissSuggestionInputSchema = suggestionCommandInputSchema.extend({
  status: z.literal("dismissed").default("dismissed"),
});

export type DismissSuggestionInput = z.infer<typeof dismissSuggestionInputSchema>;

export const updateSuggestionStatusInputSchema = z.object({
  projectId: z.string(),
  suggestionId: z.string(),
  status: suggestionStatusSchema,
});

export type UpdateSuggestionStatusInput = z.infer<
  typeof updateSuggestionStatusInputSchema
>;

export const saveProjectStateInputSchema = projectStateSchema;
export type SaveProjectStateInput = z.infer<typeof saveProjectStateInputSchema>;

export const setProjectMetadataInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  logline: z.string().default(""),
  premise: z.string().default(""),
  centralConflict: z.string().default(""),
  thematicIntent: z.string().default(""),
  endingDirection: z.string().default(""),
  genre: z.string().default(""),
  tone: z.string().default(""),
  audienceNotes: z.string().default(""),
});

export type SetProjectMetadataInput = z.infer<
  typeof setProjectMetadataInputSchema
>;
