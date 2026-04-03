import { describe, expect, it } from "vitest";
import { sampleProjectSnapshot } from "@novelforge/test-fixtures";
import {
  DEFAULT_PROJECT_ROUTE,
  normalizeProjectRoute,
  resolveProjectRouteNavigation,
  shouldPersistProjectRoute,
} from "./routes";

describe("project route helpers", () => {
  it("falls back to the default route for root or missing values", () => {
    expect(normalizeProjectRoute(undefined)).toBe(DEFAULT_PROJECT_ROUTE);
    expect(normalizeProjectRoute(null)).toBe(DEFAULT_PROJECT_ROUTE);
    expect(normalizeProjectRoute("")).toBe(DEFAULT_PROJECT_ROUTE);
    expect(normalizeProjectRoute("/")).toBe(DEFAULT_PROJECT_ROUTE);
  });

  it("keeps valid workspace routes intact", () => {
    expect(normalizeProjectRoute("/story")).toBe("/story");
    expect(normalizeProjectRoute("/chapters")).toBe("/chapters");
    expect(normalizeProjectRoute("/chapters/chapter-1")).toBe("/chapters/chapter-1");
    expect(normalizeProjectRoute("/scenes")).toBe("/scenes");
    expect(normalizeProjectRoute("/scratchpad")).toBe("/scratchpad");
  });

  it("keeps supported detail routes intact", () => {
    expect(normalizeProjectRoute("/scenes/scene-1")).toBe("/scenes/scene-1");
    expect(normalizeProjectRoute("/characters/char-ava")).toBe("/characters/char-ava");
    expect(normalizeProjectRoute("/suggestions/suggestion-1")).toBe("/suggestions/suggestion-1");
  });

  it("does not persist the transient root route", () => {
    expect(shouldPersistProjectRoute("/")).toBe(false);
    expect(shouldPersistProjectRoute("/story")).toBe(true);
    expect(shouldPersistProjectRoute("/chapters")).toBe(true);
    expect(shouldPersistProjectRoute("/chapters/chapter-1")).toBe(true);
    expect(shouldPersistProjectRoute("/scratchpad")).toBe(true);
    expect(shouldPersistProjectRoute("/scenes/scene-1")).toBe(true);
    expect(shouldPersistProjectRoute("/characters/char-ava")).toBe(true);
    expect(shouldPersistProjectRoute("/suggestions/suggestion-1")).toBe(true);
  });

  it("resolves valid detail routes into typed router navigation targets", () => {
    expect(
      resolveProjectRouteNavigation("/chapters/chapter-1", sampleProjectSnapshot),
    ).toEqual({
      to: "/chapters/$chapterId",
      params: {
        chapterId: "chapter-1",
      },
    });
    expect(resolveProjectRouteNavigation("/scenes/scene-1", sampleProjectSnapshot)).toEqual({
      to: "/scenes/$sceneId",
      params: {
        sceneId: "scene-1",
      },
    });
    expect(
      resolveProjectRouteNavigation("/characters/char-ava", sampleProjectSnapshot),
    ).toEqual({
      to: "/characters/$characterId",
      params: {
        characterId: "char-ava",
      },
    });
  });

  it("falls back to safe parent routes when detail targets are stale", () => {
    expect(
      resolveProjectRouteNavigation("/chapters/chapter-missing", sampleProjectSnapshot),
    ).toEqual({
      to: "/chapters",
    });
    expect(
      resolveProjectRouteNavigation("/scenes/scene-missing", sampleProjectSnapshot),
    ).toEqual({
      to: "/scenes",
    });
    expect(
      resolveProjectRouteNavigation("/characters/char-missing", sampleProjectSnapshot),
    ).toEqual({
      to: "/characters",
    });
  });

  it("falls back to the default route for other invalid routes", () => {
    expect(resolveProjectRouteNavigation("/unknown/detail", sampleProjectSnapshot)).toEqual({
      to: DEFAULT_PROJECT_ROUTE,
    });
  });
});
