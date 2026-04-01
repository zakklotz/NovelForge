import { z } from "zod";
import { domainEventSchema } from "./events";

export const entityKindSchema = z.enum([
  "project",
  "chapter",
  "scene",
  "character",
  "suggestion",
]);

export type EntityKind = z.infer<typeof entityKindSchema>;

export const suggestionStatusSchema = z.enum([
  "open",
  "applied",
  "dismissed",
  "resolved",
]);

export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

export const suggestionSeveritySchema = z.enum(["low", "medium", "high"]);

export type SuggestionSeverity = z.infer<typeof suggestionSeveritySchema>;

export const suggestionTypeSchema = z.enum([
  "dependency-order",
  "chapter-summary-stale",
  "scene-moved-across-chapters",
  "continuity-tag-review",
  "character-linked-scene-review",
  "manual-scan-summary",
]);

export type SuggestionType = z.infer<typeof suggestionTypeSchema>;

export const domainObjectRefSchema = z.object({
  kind: entityKindSchema,
  id: z.string(),
  title: z.string().optional(),
});

export type DomainObjectRef = z.infer<typeof domainObjectRefSchema>;

export const relationshipSchema = z.object({
  characterId: z.string(),
  summary: z.string(),
});

export type Relationship = z.infer<typeof relationshipSchema>;

export const aiProviderIdSchema = z.enum(["gemini", "groq", "openrouter"]);

export type AIProviderId = z.infer<typeof aiProviderIdSchema>;

export const aiProviderSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  hasApiKey: z.boolean().default(false),
  defaultModel: z.string().min(1),
});

export type AIProviderSettings = z.infer<typeof aiProviderSettingsSchema>;

export const aiSettingsSchema = z.object({
  defaultProvider: aiProviderIdSchema.default("gemini"),
  providers: z.object({
    gemini: aiProviderSettingsSchema,
    groq: aiProviderSettingsSchema,
    openrouter: aiProviderSettingsSchema,
  }),
});

export type AISettings = z.infer<typeof aiSettingsSchema>;

export const appSettingsSchema = z.object({
  ai: aiSettingsSchema,
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const recommendedModelSchema = z.object({
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

export type RecommendedModel = z.infer<typeof recommendedModelSchema>;

export const scratchpadActionSchema = z.enum([
  "create-chapters",
  "create-scenes",
  "create-character-card",
  "summarize",
  "extract-continuity-notes",
]);

export type ScratchpadAction = z.infer<typeof scratchpadActionSchema>;

export const structuredAiActionSchema = z.enum([
  "story-diagnose-structure",
  "chapter-propose-scenes",
  "scene-generate-beats",
  "scene-expand-draft",
]);

export type StructuredAiAction = z.infer<typeof structuredAiActionSchema>;

export const scratchpadRoleSchema = z.enum(["user", "assistant", "system"]);

export type ScratchpadRole = z.infer<typeof scratchpadRoleSchema>;

export const scratchpadProjectContextSchema = z.object({
  chapterIds: z.array(z.string()).default([]),
  sceneIds: z.array(z.string()).default([]),
  characterIds: z.array(z.string()).default([]),
});

export type ScratchpadProjectContext = z.infer<
  typeof scratchpadProjectContextSchema
>;

export const chapterProposalSchema = z.object({
  targetChapterId: z.string().nullable().default(null),
  title: z.string().min(1),
  summary: z.string().default(""),
  purpose: z.string().default(""),
  majorEvents: z.array(z.string()).default([]),
  emotionalMovement: z.string().default(""),
  characterFocusIds: z.array(z.string()).default([]),
  setupPayoffNotes: z.string().default(""),
});

export type ChapterProposal = z.infer<typeof chapterProposalSchema>;

export const sceneProposalSchema = z.object({
  targetSceneId: z.string().nullable().default(null),
  chapterId: z.string().nullable().default(null),
  chapterTitleHint: z.string().nullable().default(null),
  title: z.string().min(1),
  summary: z.string().default(""),
  purpose: z.string().default(""),
  beatOutline: z.string().default(""),
  conflict: z.string().default(""),
  outcome: z.string().default(""),
  povCharacterId: z.string().nullable().default(null),
  location: z.string().default(""),
  timeLabel: z.string().default(""),
  involvedCharacterIds: z.array(z.string()).default([]),
  continuityTags: z.array(z.string()).default([]),
  dependencySceneIds: z.array(z.string()).default([]),
  manuscriptText: z.string().default("<p></p>"),
});

export type SceneProposal = z.infer<typeof sceneProposalSchema>;

export const characterProposalSchema = z.object({
  targetCharacterId: z.string().nullable().default(null),
  name: z.string().min(1),
  role: z.string().default(""),
  personalityTraits: z.array(z.string()).default([]),
  motivations: z.string().default(""),
  fears: z.string().default(""),
  worldview: z.string().default(""),
  speakingStyle: z.string().default(""),
  vocabularyTendencies: z.string().default(""),
  speechRhythm: z.string().default(""),
  emotionalBaseline: z.string().default(""),
  relationships: z.array(relationshipSchema).default([]),
  secrets: z.string().default(""),
  arcDirection: z.string().default(""),
  contradictions: z.string().default(""),
});

export type CharacterProposal = z.infer<typeof characterProposalSchema>;

export const storyDiagnosticEntrySchema = z.object({
  title: z.string().min(1),
  detail: z.string().default(""),
  focus: domainObjectRefSchema.nullable().default(null),
  related: z.array(domainObjectRefSchema).default([]),
});

export type StoryDiagnosticEntry = z.infer<typeof storyDiagnosticEntrySchema>;

export const storyBriefAlignmentSchema = z.enum(["support", "weak_support", "risk"]);

export type StoryBriefAlignment = z.infer<typeof storyBriefAlignmentSchema>;

export const storyBriefAlignmentNoteSchema = storyDiagnosticEntrySchema.extend({
  alignment: storyBriefAlignmentSchema,
});

export type StoryBriefAlignmentNote = z.infer<typeof storyBriefAlignmentNoteSchema>;

export const storyStructureDiagnosticSchema = z.object({
  underdefinedChapters: z.array(storyDiagnosticEntrySchema).default([]),
  redundantFunctions: z.array(storyDiagnosticEntrySchema).default([]),
  missingTransitions: z.array(storyDiagnosticEntrySchema).default([]),
  briefAlignmentNotes: z.array(storyBriefAlignmentNoteSchema).default([]),
  endingDirectionPreparation: z.array(storyDiagnosticEntrySchema).default([]),
  nextPlanningTargets: z.array(storyDiagnosticEntrySchema).default([]),
});

export type StoryStructureDiagnostic = z.infer<
  typeof storyStructureDiagnosticSchema
>;

export const scratchpadResultSchema = z.object({
  summary: z.string().default(""),
  chapters: z.array(chapterProposalSchema).default([]),
  scenes: z.array(sceneProposalSchema).default([]),
  characters: z.array(characterProposalSchema).default([]),
  continuityNotes: z.array(z.string()).default([]),
});

export type ScratchpadResult = z.infer<typeof scratchpadResultSchema>;

export const scratchpadMessageSchema = z.object({
  id: z.string(),
  role: scratchpadRoleSchema,
  content: z.string().min(1),
  createdAt: z.string(),
  action: scratchpadActionSchema.nullable().default(null),
});

export type ScratchpadMessage = z.infer<typeof scratchpadMessageSchema>;

export const scratchpadSessionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  messages: z.array(scratchpadMessageSchema).default([]),
  latestResult: scratchpadResultSchema.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScratchpadSession = z.infer<typeof scratchpadSessionSchema>;

export const providerConnectionResultSchema = z.object({
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  success: z.boolean(),
  message: z.string().min(1),
});

export type ProviderConnectionResult = z.infer<
  typeof providerConnectionResultSchema
>;

export const scratchpadChatResponseSchema = z.object({
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  assistantMessage: scratchpadMessageSchema,
  result: scratchpadResultSchema,
});

export type ScratchpadChatResponse = z.infer<
  typeof scratchpadChatResponseSchema
>;

export const structuredAiResultSchema = z.object({
  summary: z.string().default(""),
  sceneProposals: z.array(sceneProposalSchema).default([]),
  beatOutline: z.string().default(""),
  manuscriptText: z.string().default(""),
  storyStructureDiagnostic: storyStructureDiagnosticSchema.default({
    underdefinedChapters: [],
    redundantFunctions: [],
    missingTransitions: [],
    briefAlignmentNotes: [],
    endingDirectionPreparation: [],
    nextPlanningTargets: [],
  }),
});

export type StructuredAiResult = z.infer<typeof structuredAiResultSchema>;

export const structuredAiResponseSchema = z.object({
  providerId: aiProviderIdSchema,
  modelId: z.string().min(1),
  action: structuredAiActionSchema,
  assistantMessage: z.string().default(""),
  result: structuredAiResultSchema,
});

export type StructuredAiResponse = z.infer<typeof structuredAiResponseSchema>;

export const applyScratchpadResultOutputSchema = z.object({
  applied: z.array(domainObjectRefSchema).default([]),
  events: z.array(domainEventSchema).default([]),
});

export type ApplyScratchpadResultOutput = z.infer<
  typeof applyScratchpadResultOutputSchema
>;

export const projectSettingsSchema = z.object({
  autosaveIntervalMs: z.number().int().positive().default(1500),
  autoAnalyze: z.boolean().default(true),
  editorFontScale: z.number().min(0.8).max(1.5).default(1),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const projectSchema = z.object({
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
  schemaVersion: z.number().int().default(3),
  settings: projectSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

export const chapterSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  summary: z.string().default(""),
  purpose: z.string().default(""),
  majorEvents: z.array(z.string()).default([]),
  emotionalMovement: z.string().default(""),
  characterFocusIds: z.array(z.string()).default([]),
  setupPayoffNotes: z.string().default(""),
  orderIndex: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Chapter = z.infer<typeof chapterSchema>;

export const sceneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  chapterId: z.string().nullable(),
  orderIndex: z.number().int(),
  title: z.string().min(1),
  summary: z.string().default(""),
  purpose: z.string().default(""),
  beatOutline: z.string().default(""),
  conflict: z.string().default(""),
  outcome: z.string().default(""),
  povCharacterId: z.string().nullable(),
  location: z.string().default(""),
  timeLabel: z.string().default(""),
  involvedCharacterIds: z.array(z.string()).default([]),
  continuityTags: z.array(z.string()).default([]),
  dependencySceneIds: z.array(z.string()).default([]),
  manuscriptText: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Scene = z.infer<typeof sceneSchema>;

export const characterSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  role: z.string().default(""),
  personalityTraits: z.array(z.string()).default([]),
  motivations: z.string().default(""),
  fears: z.string().default(""),
  worldview: z.string().default(""),
  speakingStyle: z.string().default(""),
  vocabularyTendencies: z.string().default(""),
  speechRhythm: z.string().default(""),
  emotionalBaseline: z.string().default(""),
  relationships: z.array(relationshipSchema).default([]),
  secrets: z.string().default(""),
  arcDirection: z.string().default(""),
  contradictions: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Character = z.infer<typeof characterSchema>;

export const suggestionEvidenceRefSchema = z.object({
  kind: entityKindSchema,
  id: z.string(),
  label: z.string().optional(),
});

export type SuggestionEvidenceRef = z.infer<typeof suggestionEvidenceRefSchema>;

export const suggestionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: suggestionTypeSchema,
  triggerEvent: z.string(),
  sourceObject: domainObjectRefSchema,
  impactedObject: domainObjectRefSchema,
  severity: suggestionSeveritySchema,
  title: z.string(),
  rationale: z.string(),
  evidenceRefs: z.array(suggestionEvidenceRefSchema).default([]),
  proposedAction: z.string(),
  status: suggestionStatusSchema.default("open"),
  fingerprint: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export const viewFiltersSchema = z.object({
  activeChapterId: z.string().nullable().default(null),
  searchText: z.string().default(""),
  sceneCharacterId: z.string().nullable().default(null),
  sceneContinuityTag: z.string().nullable().default(null),
  suggestionStatus: suggestionStatusSchema.nullable().default(null),
});

export type ViewFilters = z.infer<typeof viewFiltersSchema>;

export const panelLayoutSchema = z.object({
  chaptersInspectorWidth: z.number().default(360),
  sceneLeftWidth: z.number().default(320),
  sceneRightWidth: z.number().default(360),
});

export type PanelLayout = z.infer<typeof panelLayoutSchema>;

export const autosaveStateSchema = z.object({
  isSaving: z.boolean().default(false),
  lastSavedAt: z.string().nullable().default(null),
});

export type AutosaveState = z.infer<typeof autosaveStateSchema>;

export const analysisQueueItemSchema = z.object({
  eventType: z.string(),
  entityId: z.string().optional(),
  queuedAt: z.string(),
});

export type AnalysisQueueItem = z.infer<typeof analysisQueueItemSchema>;

export const projectStateSchema = z.object({
  projectId: z.string(),
  lastRoute: z.string().default("/chapters"),
  openSceneIds: z.array(z.string()).default([]),
  selectedIds: z.array(z.string()).default([]),
  viewFilters: viewFiltersSchema,
  panelLayout: panelLayoutSchema,
  autosaveState: autosaveStateSchema,
  analysisQueue: z.array(analysisQueueItemSchema).default([]),
  lastFullScanAt: z.string().nullable().default(null),
});

export type ProjectState = z.infer<typeof projectStateSchema>;

export const projectSnapshotSchema = z.object({
  project: projectSchema,
  chapters: z.array(chapterSchema),
  scenes: z.array(sceneSchema),
  characters: z.array(characterSchema),
  suggestions: z.array(suggestionSchema),
  projectState: projectStateSchema,
});

export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;
