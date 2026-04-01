import type { DomainEvent, Suggestion } from "@novelforge/domain";

const timestamp = "2026-03-15T00:00:00.000Z";
const projectId = "project-ashen-sky";

export const sampleDomainEvents = {
  sceneMoved: {
    id: "event-scene-moved",
    projectId,
    occurredAt: timestamp,
    type: "scene.moved",
    sceneId: "scene-3",
    fromChapterId: "chapter-2",
    toChapterId: "chapter-1",
  },
  sceneUpdated: {
    id: "event-scene-updated",
    projectId,
    occurredAt: timestamp,
    type: "scene.updated",
    sceneId: "scene-2",
    changedFields: ["summary", "dependencySceneIds"],
  },
  chapterUpdated: {
    id: "event-chapter-updated",
    projectId,
    occurredAt: timestamp,
    type: "chapter.updated",
    chapterId: "chapter-1",
    changedFields: ["summary", "purpose"],
  },
  characterUpdated: {
    id: "event-character-updated",
    projectId,
    occurredAt: timestamp,
    type: "character.updated",
    characterId: "char-ava",
    changedFields: ["speakingStyle", "arcDirection"],
  },
  analysisManualRequested: {
    id: "event-manual-analysis",
    projectId,
    occurredAt: timestamp,
    type: "analysis.manualRequested",
  },
} satisfies Record<string, DomainEvent>;

export const sampleEventList = Object.values(sampleDomainEvents);

export const sampleSuggestionRecords: Suggestion[] = [
  {
    id: "sugg-dependency-order",
    projectId,
    type: "dependency-order",
    triggerEvent: "scene.moved",
    sourceObject: { kind: "scene", id: "scene-3", title: "Checkpoint Lanterns" },
    impactedObject: { kind: "scene", id: "scene-2", title: "The Crate Speaks" },
    severity: "high",
    title: "Dependency order may be broken for Checkpoint Lanterns",
    rationale:
      "The scene appears before a prerequisite reveal in the current narrative order.",
    evidenceRefs: [
      { kind: "scene", id: "scene-3", label: "Checkpoint Lanterns" },
      { kind: "scene", id: "scene-2", label: "The Crate Speaks" },
    ],
    proposedAction:
      "Move the dependent scene later or remove the dependency if the reveal is no longer required.",
    status: "open",
    fingerprint: "dependency-order:scene-3:scene-2:scene.moved",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "sugg-chapter-summary-stale",
    projectId,
    type: "chapter-summary-stale",
    triggerEvent: "scene.updated",
    sourceObject: { kind: "scene", id: "scene-2", title: "The Crate Speaks" },
    impactedObject: {
      kind: "chapter",
      id: "chapter-1",
      title: "Chapter 1: The Wrong Package",
    },
    severity: "medium",
    title: "Review Chapter 1 after scene changes",
    rationale:
      "A child scene changed enough that the parent chapter summary or purpose may no longer match.",
    evidenceRefs: [
      { kind: "scene", id: "scene-2", label: "The Crate Speaks" },
      { kind: "chapter", id: "chapter-1", label: "Chapter 1: The Wrong Package" },
    ],
    proposedAction:
      "Refresh the chapter summary, purpose, and major events so they reflect the current scene set.",
    status: "open",
    fingerprint: "chapter-summary-stale:scene-2:chapter-1:scene.updated",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "sugg-scene-moved",
    projectId,
    type: "scene-moved-across-chapters",
    triggerEvent: "scene.moved",
    sourceObject: { kind: "scene", id: "scene-3", title: "Checkpoint Lanterns" },
    impactedObject: {
      kind: "chapter",
      id: "chapter-1",
      title: "Chapter 1: The Wrong Package",
    },
    severity: "medium",
    title: "Confirm Checkpoint Lanterns still fits Chapter 1",
    rationale:
      "The scene moved into a different chapter, so its purpose and emotional progression may need review.",
    evidenceRefs: [
      { kind: "scene", id: "scene-3", label: "Checkpoint Lanterns" },
      { kind: "chapter", id: "chapter-1", label: "Chapter 1: The Wrong Package" },
    ],
    proposedAction:
      "Review the destination chapter intent and update the scene summary if this move changes its structural role.",
    status: "open",
    fingerprint: "scene-moved-across-chapters:scene-3:chapter-1:scene.moved",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "sugg-continuity-tag",
    projectId,
    type: "continuity-tag-review",
    triggerEvent: "scene.updated",
    sourceObject: { kind: "scene", id: "scene-3", title: "Checkpoint Lanterns" },
    impactedObject: { kind: "scene", id: "scene-3", title: "Checkpoint Lanterns" },
    severity: "medium",
    title: "Review continuity tag \"star-map\"",
    rationale:
      "This scene shares a continuity thread with other scenes that may need chronology or reveal-order review.",
    evidenceRefs: [
      { kind: "scene", id: "scene-1", label: "Dock Nine Exchange" },
      { kind: "scene", id: "scene-2", label: "The Crate Speaks" },
      { kind: "scene", id: "scene-3", label: "Checkpoint Lanterns" },
    ],
    proposedAction:
      "Check the continuity thread across all linked scenes and verify the reveal order still works.",
    status: "open",
    fingerprint: "continuity-tag-review:scene-3:scene-3:scene.updated",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "sugg-character-linked-scene",
    projectId,
    type: "character-linked-scene-review",
    triggerEvent: "character.updated",
    sourceObject: { kind: "character", id: "char-ava", title: "Ava Voss" },
    impactedObject: { kind: "scene", id: "scene-1", title: "Dock Nine Exchange" },
    severity: "medium",
    title: "Review Dock Nine Exchange after updating Ava Voss",
    rationale:
      "A character card changed, so scenes linked to that character may need dialogue or behavior adjustments.",
    evidenceRefs: [
      { kind: "character", id: "char-ava", label: "Ava Voss" },
      { kind: "scene", id: "scene-1", label: "Dock Nine Exchange" },
    ],
    proposedAction:
      "Review the linked scene for voice, motivation, and arc consistency with the updated character card.",
    status: "open",
    fingerprint:
      "character-linked-scene-review:char-ava:scene-1:character.updated",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "sugg-manual-scan",
    projectId,
    type: "manual-scan-summary",
    triggerEvent: "analysis.manualRequested",
    sourceObject: { kind: "project", id: projectId, title: "Ashen Sky" },
    impactedObject: { kind: "project", id: projectId, title: "Ashen Sky" },
    severity: "low",
    title: "Manual story scan complete",
    rationale:
      "NovelForge finished a manual structure pass across the current project and refreshed open review items.",
    evidenceRefs: [
      { kind: "chapter", id: "chapter-1", label: "Chapter 1: The Wrong Package" },
      { kind: "chapter", id: "chapter-2", label: "Chapter 2: Border Sparks" },
    ],
    proposedAction:
      "Review the freshly opened suggestions and confirm that chapter and scene logic still align.",
    status: "open",
    fingerprint:
      "manual-scan-summary:project-ashen-sky:project-ashen-sky:analysis.manualRequested",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
