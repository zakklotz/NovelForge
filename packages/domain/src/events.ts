import { z } from "zod";

const baseEventSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  occurredAt: z.string(),
});

export const sceneMovedEventSchema = baseEventSchema.extend({
  type: z.literal("scene.moved"),
  sceneId: z.string(),
  fromChapterId: z.string().nullable(),
  toChapterId: z.string().nullable(),
});

export const sceneUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal("scene.updated"),
  sceneId: z.string(),
  changedFields: z.array(z.string()),
});

export const chapterUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal("chapter.updated"),
  chapterId: z.string(),
  changedFields: z.array(z.string()),
});

export const characterUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal("character.updated"),
  characterId: z.string(),
  changedFields: z.array(z.string()),
});

export const analysisManualRequestedEventSchema = baseEventSchema.extend({
  type: z.literal("analysis.manualRequested"),
});

export const domainEventSchema = z.discriminatedUnion("type", [
  sceneMovedEventSchema,
  sceneUpdatedEventSchema,
  chapterUpdatedEventSchema,
  characterUpdatedEventSchema,
  analysisManualRequestedEventSchema,
]);

export type SceneMovedEvent = z.infer<typeof sceneMovedEventSchema>;
export type SceneUpdatedEvent = z.infer<typeof sceneUpdatedEventSchema>;
export type ChapterUpdatedEvent = z.infer<typeof chapterUpdatedEventSchema>;
export type CharacterUpdatedEvent = z.infer<typeof characterUpdatedEventSchema>;
export type AnalysisManualRequestedEvent = z.infer<
  typeof analysisManualRequestedEventSchema
>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
