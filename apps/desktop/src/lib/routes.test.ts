import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_ROUTE,
  normalizeProjectRoute,
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
    expect(normalizeProjectRoute("/scenes")).toBe("/scenes");
    expect(normalizeProjectRoute("/scratchpad")).toBe("/scratchpad");
  });

  it("falls back for detail routes that are not yet restored on project open", () => {
    expect(normalizeProjectRoute("/scenes/scene-1")).toBe(DEFAULT_PROJECT_ROUTE);
    expect(normalizeProjectRoute("/chapters/chapter-1")).toBe(DEFAULT_PROJECT_ROUTE);
  });

  it("does not persist the transient root route", () => {
    expect(shouldPersistProjectRoute("/")).toBe(false);
    expect(shouldPersistProjectRoute("/chapters")).toBe(true);
    expect(shouldPersistProjectRoute("/scratchpad")).toBe(true);
    expect(shouldPersistProjectRoute("/scenes/scene-1")).toBe(false);
  });
});
