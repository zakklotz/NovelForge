import { describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  applySuggestionInputSchema,
  dismissSuggestionInputSchema,
  domainEventSchema,
  projectSnapshotSchema,
  recommendedModelSchema,
  runImpactAnalysisInputSchema,
  scratchpadChatResponseSchema,
  scratchpadSessionSchema,
  structuredAiResponseSchema,
  suggestionSchema,
} from "../src";
import {
  sampleAppSettings,
  sampleDomainEvents,
  sampleEventList,
  sampleRecommendedModels,
  sampleProjectSnapshot,
  sampleScratchpadChatResponse,
  sampleScratchpadSession,
  sampleSuggestionRecords,
} from "../../test-fixtures/src";

describe("domain schemas", () => {
  it("parses the canonical sample project snapshot", () => {
    expect(projectSnapshotSchema.parse(sampleProjectSnapshot)).toEqual(
      sampleProjectSnapshot,
    );
  });

  it("parses each sample domain event", () => {
    expect(sampleEventList.map((event) => domainEventSchema.parse(event))).toEqual(
      sampleEventList,
    );
    expect(domainEventSchema.parse(sampleDomainEvents.sceneMoved).type).toBe(
      "scene.moved",
    );
  });

  it("accepts one sample suggestion for every approved v1 rule type", () => {
    const parsedSuggestions = sampleSuggestionRecords.map((record) =>
      suggestionSchema.parse(record),
    );

    expect(
      new Set(parsedSuggestions.map((suggestion) => suggestion.type)),
    ).toEqual(
      new Set([
        "dependency-order",
        "chapter-summary-stale",
        "scene-moved-across-chapters",
        "continuity-tag-review",
        "character-linked-scene-review",
        "manual-scan-summary",
      ]),
    );
  });

  it("parses app-level AI settings and recommendations", () => {
    expect(appSettingsSchema.parse(sampleAppSettings)).toEqual(sampleAppSettings);
    expect(
      sampleRecommendedModels.map((model) => recommendedModelSchema.parse(model)),
    ).toEqual(sampleRecommendedModels);
  });

  it("parses scratchpad sessions and chat responses", () => {
    expect(scratchpadSessionSchema.parse(sampleScratchpadSession)).toEqual(
      sampleScratchpadSession,
    );
    expect(scratchpadChatResponseSchema.parse(sampleScratchpadChatResponse)).toEqual(
      sampleScratchpadChatResponse,
    );
  });

  it("parses structured story diagnostics with chapter and scene refs", () => {
    expect(
      structuredAiResponseSchema.parse({
        providerId: "gemini",
        modelId: "gemini-2.5-flash",
        action: "story-diagnose-structure",
        assistantMessage: "Reviewed the full story spine.",
        result: {
          summary: "Chapter 2 needs a clearer handoff.",
          sceneProposals: [],
          beatOutline: "",
          manuscriptText: "",
          storyStructureDiagnostic: {
            underdefinedChapters: [
              {
                title: "Chapter 2 needs a clearer chapter turn",
                detail: "The chapter pressure is visible, but its end-state is still vague.",
                focus: {
                  kind: "chapter",
                  id: "chapter-2",
                  title: "Chapter 2: Border Sparks",
                },
                related: [
                  {
                    kind: "scene",
                    id: "scene-3",
                    title: "Checkpoint Lanterns",
                  },
                ],
              },
            ],
            redundantFunctions: [],
            missingTransitions: [],
            nextPlanningTargets: [],
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        action: "story-diagnose-structure",
      }),
    );
  });

  it("exposes the approved first-class suggestion commands", () => {
    expect(
      applySuggestionInputSchema.parse({
        projectId: "project-ashen-sky",
        suggestionId: "sugg-1",
      }).status,
    ).toBe("applied");

    expect(
      dismissSuggestionInputSchema.parse({
        projectId: "project-ashen-sky",
        suggestionId: "sugg-1",
      }).status,
    ).toBe("dismissed");
  });

  it("keeps runImpactAnalysis available as a shared contract", () => {
    expect(
      runImpactAnalysisInputSchema.parse({
        projectId: "project-ashen-sky",
        eventType: "analysis.manualRequested",
      }),
    ).toEqual({
      projectId: "project-ashen-sky",
      eventType: "analysis.manualRequested",
      entityId: null,
    });
  });
});
