import { describe, expect, it } from "vitest";
import { analyzeProjectSnapshot } from "../src/index";
import { sampleProjectSnapshot } from "../../test-fixtures/src";

describe("analyzeProjectSnapshot", () => {
  it("flags dependency order problems after a scene move", () => {
    const snapshot = structuredClone(sampleProjectSnapshot);
    const festivalScene = snapshot.scenes.find((scene) => scene.id === "scene-3");
    if (!festivalScene) {
      throw new Error("Missing scene fixture.");
    }

    festivalScene.orderIndex = 0;
    festivalScene.chapterId = "chapter-1";

    const result = analyzeProjectSnapshot({
      snapshot,
      event: {
        id: "evt-1",
        projectId: snapshot.project.id,
        occurredAt: new Date().toISOString(),
        type: "scene.moved",
        sceneId: "scene-3",
        fromChapterId: "chapter-2",
        toChapterId: "chapter-1",
      },
    });

    expect(result.suggestions.some((suggestion) => suggestion.type === "dependency-order")).toBe(true);
  });

  it("flags linked scenes after a character update", () => {
    const snapshot = structuredClone(sampleProjectSnapshot);
    const result = analyzeProjectSnapshot({
      snapshot,
      event: {
        id: "evt-2",
        projectId: snapshot.project.id,
        occurredAt: new Date().toISOString(),
        type: "character.updated",
        characterId: "char-ava",
        changedFields: ["speakingStyle"],
      },
    });

    expect(
      result.suggestions.every(
        (suggestion) => suggestion.type === "character-linked-scene-review",
      ),
    ).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
