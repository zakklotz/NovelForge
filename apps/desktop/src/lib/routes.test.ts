import { describe, expect, it } from "vitest";
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
    expect(normalizeProjectRoute("/chapters")).toBe("/chapters");
    expect(normalizeProjectRoute("/chapters/chapter-1")).toBe("/chapters/chapter-1");
    expect(normalizeProjectRoute("/scenes")).toBe("/scenes");
    expect(normalizeProjectRoute("/scratchpad")).toBe("/scratchpad");
  });

  it("still falls back for unsupported detail routes", () => {
    expect(normalizeProjectRoute("/scenes/scene-1")).toBe(DEFAULT_PROJECT_ROUTE);
  });

  it("does not persist the transient root route", () => {
    expect(shouldPersistProjectRoute("/")).toBe(false);
    expect(shouldPersistProjectRoute("/chapters")).toBe(true);
    expect(shouldPersistProjectRoute("/chapters/chapter-1")).toBe(true);
    expect(shouldPersistProjectRoute("/scratchpad")).toBe(true);
    expect(shouldPersistProjectRoute("/scenes/scene-1")).toBe(false);
  });

  it("resolves chapter detail routes into typed router navigation targets", () => {
    expect(resolveProjectRouteNavigation("/chapters/chapter-1")).toEqual({
      to: "/chapters/$chapterId",
      params: {
        chapterId: "chapter-1",
      },
    });
    expect(resolveProjectRouteNavigation("/scenes/scene-1")).toEqual({
      to: DEFAULT_PROJECT_ROUTE,
    });
  });
});
