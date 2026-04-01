import type {
  Chapter,
  DomainEvent,
  ProjectSnapshot,
  Scene,
  Suggestion,
  SuggestionSeverity,
  SuggestionType,
} from "@novelforge/domain";
import { domainEventSchema } from "@novelforge/domain";
import type { AnalysisInput, AnalysisOutput } from "./types";

const nowIso = () => new Date().toISOString();

const buildFingerprint = (
  type: SuggestionType,
  sourceId: string,
  impactedId: string,
  eventType: string,
) => `${type}:${sourceId}:${impactedId}:${eventType}`;

const buildSuggestion = (
  snapshot: ProjectSnapshot,
  eventType: string,
  type: SuggestionType,
  severity: SuggestionSeverity,
  sourceObject: Suggestion["sourceObject"],
  impactedObject: Suggestion["impactedObject"],
  title: string,
  rationale: string,
  proposedAction: string,
  evidenceRefs: Suggestion["evidenceRefs"] = [],
): Suggestion => {
  const timestamp = nowIso();

  return {
    id: crypto.randomUUID(),
    projectId: snapshot.project.id,
    type,
    triggerEvent: eventType,
    sourceObject,
    impactedObject,
    severity,
    title,
    rationale,
    evidenceRefs,
    proposedAction,
    status: "open",
    fingerprint: buildFingerprint(type, sourceObject.id, impactedObject.id, eventType),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const compareSceneOrder = (
  orderMap: Map<string, number>,
  dependencyId: string,
  sceneId: string,
) => {
  const dependencyOrder = orderMap.get(dependencyId);
  const sceneOrder = orderMap.get(sceneId);

  if (dependencyOrder === undefined || sceneOrder === undefined) {
    return false;
  }

  return dependencyOrder >= sceneOrder;
};

const getNarrativeOrder = (snapshot: ProjectSnapshot) => {
  const chapterIndex = new Map(snapshot.chapters.map((chapter) => [chapter.id, chapter.orderIndex]));

  return new Map(
    [...snapshot.scenes]
      .sort((a, b) => {
        const chapterA = a.chapterId ? chapterIndex.get(a.chapterId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
        const chapterB = b.chapterId ? chapterIndex.get(b.chapterId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

        if (chapterA !== chapterB) {
          return chapterA - chapterB;
        }

        return a.orderIndex - b.orderIndex;
      })
      .map((scene, index) => [scene.id, index]),
  );
};

const getSceneById = (snapshot: ProjectSnapshot, sceneId: string) =>
  snapshot.scenes.find((scene) => scene.id === sceneId);

const getChapterById = (snapshot: ProjectSnapshot, chapterId: string | null) =>
  chapterId ? snapshot.chapters.find((chapter) => chapter.id === chapterId) : undefined;

const getCharacterById = (snapshot: ProjectSnapshot, characterId: string | null) =>
  characterId ? snapshot.characters.find((character) => character.id === characterId) : undefined;

const pushChapterStaleSuggestion = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  eventType: string,
  scene: Scene,
  chapter: Chapter | undefined,
) => {
  if (!chapter) {
    return;
  }

  suggestions.push(
    buildSuggestion(
      snapshot,
      eventType,
      "chapter-summary-stale",
      "medium",
      { kind: "scene", id: scene.id, title: scene.title },
      { kind: "chapter", id: chapter.id, title: chapter.title },
      `Review ${chapter.title} after scene changes`,
      `${scene.title} changed inside this chapter, so its summary or purpose may now be stale.`,
      "Update the chapter summary, purpose, and major events to reflect the current scene lineup.",
      [
        { kind: "scene", id: scene.id, label: scene.title },
        { kind: "chapter", id: chapter.id, label: chapter.title },
      ],
    ),
  );
};

const runDependencyRule = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  event: DomainEvent,
  candidateScenes: Scene[],
) => {
  const orderMap = getNarrativeOrder(snapshot);

  for (const scene of candidateScenes) {
    for (const dependencyId of scene.dependencySceneIds) {
      if (!compareSceneOrder(orderMap, dependencyId, scene.id)) {
        continue;
      }

      const dependency = getSceneById(snapshot, dependencyId);
      suggestions.push(
        buildSuggestion(
          snapshot,
          event.type,
          "dependency-order",
          "high",
          { kind: "scene", id: scene.id, title: scene.title },
          { kind: "scene", id: dependencyId, title: dependency?.title ?? "Dependency scene" },
          `Dependency order may be broken for ${scene.title}`,
          `${scene.title} appears before a scene it depends on in the current story order.`,
          "Reorder scenes or revise the dependency list so prerequisite information is revealed earlier.",
          [
            { kind: "scene", id: scene.id, label: scene.title },
            dependency
              ? { kind: "scene", id: dependency.id, label: dependency.title }
              : { kind: "scene", id: dependencyId, label: "Dependency scene" },
          ],
        ),
      );
    }
  }
};

const runContinuityTagRule = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  event: DomainEvent,
  candidateScenes: Scene[],
) => {
  const scenesByTag = new Map<string, Scene[]>();

  for (const scene of snapshot.scenes) {
    for (const tag of scene.continuityTags) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        continue;
      }

      const current = scenesByTag.get(normalized) ?? [];
      current.push(scene);
      scenesByTag.set(normalized, current);
    }
  }

  for (const scene of candidateScenes) {
    for (const tag of scene.continuityTags) {
      const normalized = tag.trim().toLowerCase();
      const linkedScenes = scenesByTag.get(normalized) ?? [];

      if (linkedScenes.length < 2) {
        continue;
      }

      suggestions.push(
        buildSuggestion(
          snapshot,
          event.type,
          "continuity-tag-review",
          "medium",
          { kind: "scene", id: scene.id, title: scene.title },
          { kind: "scene", id: scene.id, title: scene.title },
          `Review continuity tag "${tag}"`,
          `${scene.title} shares the "${tag}" continuity thread with ${linkedScenes.length - 1} other scenes that may need review after this change.`,
          "Check chronology, callbacks, and reveal order for all scenes connected to this continuity tag.",
          linkedScenes.map((linkedScene) => ({
            kind: "scene",
            id: linkedScene.id,
            label: linkedScene.title,
          })),
        ),
      );
    }
  }
};

const runSceneMovedRules = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  event: Extract<DomainEvent, { type: "scene.moved" }>,
) => {
  const scene = getSceneById(snapshot, event.sceneId);
  if (!scene) {
    return;
  }

  const targetChapter = getChapterById(snapshot, event.toChapterId);
  const previousChapter = getChapterById(snapshot, event.fromChapterId);

  if (targetChapter) {
    suggestions.push(
      buildSuggestion(
        snapshot,
        event.type,
      "scene-moved-across-chapters",
      "medium",
        { kind: "scene", id: scene.id, title: scene.title },
        { kind: "chapter", id: targetChapter.id, title: targetChapter.title },
        `Confirm ${scene.title} still fits ${targetChapter.title}`,
        `${scene.title} moved into a different chapter, so its purpose and emotional movement may need to be re-aligned.`,
        "Review the chapter purpose and the scene summary to confirm the scene still belongs in this structural slot.",
        [
          { kind: "scene", id: scene.id, label: scene.title },
          { kind: "chapter", id: targetChapter.id, label: targetChapter.title },
        ],
      ),
    );
  }

  pushChapterStaleSuggestion(suggestions, snapshot, event.type, scene, targetChapter);
  pushChapterStaleSuggestion(suggestions, snapshot, event.type, scene, previousChapter);

  runDependencyRule(suggestions, snapshot, event, [scene]);
  runContinuityTagRule(suggestions, snapshot, event, [scene]);
};

const runSceneUpdatedRules = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  event: Extract<DomainEvent, { type: "scene.updated" }>,
) => {
  const scene = getSceneById(snapshot, event.sceneId);
  if (!scene) {
    return;
  }

  pushChapterStaleSuggestion(
    suggestions,
    snapshot,
    event.type,
    scene,
    getChapterById(snapshot, scene.chapterId),
  );

  runDependencyRule(suggestions, snapshot, event, [scene]);
  runContinuityTagRule(suggestions, snapshot, event, [scene]);

};

const runCharacterUpdatedRules = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  event: Extract<DomainEvent, { type: "character.updated" }>,
) => {
  const character = getCharacterById(snapshot, event.characterId);
  if (!character) {
    return;
  }

  const affectedScenes = snapshot.scenes.filter(
    (scene) =>
      scene.povCharacterId === character.id ||
      scene.involvedCharacterIds.includes(character.id),
  );

  for (const scene of affectedScenes) {
    suggestions.push(
      buildSuggestion(
        snapshot,
        event.type,
        "character-linked-scene-review",
        "medium",
        { kind: "character", id: character.id, title: character.name },
        { kind: "scene", id: scene.id, title: scene.title },
        `Review ${scene.title} after updating ${character.name}`,
        `${character.name}'s card changed, so this scene may need dialogue, behavior, or motivation updates.`,
        "Review lines, reactions, and scene goals that depend on this character's voice or arc.",
        [
          { kind: "character", id: character.id, label: character.name },
          { kind: "scene", id: scene.id, label: scene.title },
        ],
      ),
    );
  }
};

const runManualAnalysisRules = (
  suggestions: Suggestion[],
  snapshot: ProjectSnapshot,
  event: Extract<DomainEvent, { type: "analysis.manualRequested" }>,
) => {
  runDependencyRule(suggestions, snapshot, event, snapshot.scenes);
  runContinuityTagRule(suggestions, snapshot, event, snapshot.scenes);

  suggestions.push(
    buildSuggestion(
      snapshot,
      event.type,
      "manual-scan-summary",
      "low",
      { kind: "project", id: snapshot.project.id, title: snapshot.project.title },
      { kind: "project", id: snapshot.project.id, title: snapshot.project.title },
      "Manual story scan complete",
      "NovelForge reviewed dependency order and continuity links across the current project.",
      "Review the refreshed open suggestions and confirm the current structure still supports the intended story flow.",
      snapshot.chapters.map((chapter) => ({
        kind: "chapter",
        id: chapter.id,
        label: chapter.title,
      })),
    ),
  );
};

export const analyzeProjectSnapshot = ({
  event,
  snapshot,
}: AnalysisInput): AnalysisOutput => {
  domainEventSchema.parse(event);

  const suggestions: Suggestion[] = [];

  switch (event.type) {
    case "scene.moved":
      runSceneMovedRules(suggestions, snapshot, event);
      break;
    case "scene.updated":
      runSceneUpdatedRules(suggestions, snapshot, event);
      break;
    case "chapter.updated":
      break;
    case "character.updated":
      runCharacterUpdatedRules(suggestions, snapshot, event);
      break;
    case "analysis.manualRequested":
      runManualAnalysisRules(suggestions, snapshot, event);
      break;
    default:
      break;
  }

  const deduped = new Map<string, Suggestion>();
  for (const suggestion of suggestions) {
    deduped.set(suggestion.fingerprint, suggestion);
  }

  return { suggestions: [...deduped.values()] };
};

export type { AnalysisInput, AnalysisOutput } from "./types";
export type { AiSuggestionProvider } from "./types";
