import type { ProjectSnapshot } from "@novelforge/domain";

export const TOP_LEVEL_PROJECT_ROUTES = [
  "/chapters",
  "/scenes",
  "/characters",
  "/suggestions",
  "/scratchpad",
] as const;

export type TopLevelProjectRoute = (typeof TOP_LEVEL_PROJECT_ROUTES)[number];
export type ChapterWorkspaceRoute = `/chapters/${string}`;
export type SceneWorkspaceRoute = `/scenes/${string}`;
export type PersistableProjectRoute =
  | TopLevelProjectRoute
  | ChapterWorkspaceRoute;

export const DEFAULT_PROJECT_ROUTE: TopLevelProjectRoute = "/chapters";

const persistableProjectRouteSet = new Set<string>(TOP_LEVEL_PROJECT_ROUTES);
const chapterWorkspaceRoutePattern = /^\/chapters\/([^/]+)$/;
const sceneWorkspaceRoutePattern = /^\/scenes\/([^/]+)$/;

function matchChapterWorkspaceRoute(route: string) {
  return chapterWorkspaceRoutePattern.exec(route);
}

function matchSceneWorkspaceRoute(route: string) {
  return sceneWorkspaceRoutePattern.exec(route);
}

function matchProjectRoute(route: string | null | undefined):
  | { kind: "top-level"; route: TopLevelProjectRoute }
  | { kind: "chapter"; route: ChapterWorkspaceRoute; chapterId: string }
  | { kind: "scene"; route: SceneWorkspaceRoute; sceneId: string }
  | null {
  if (!route || route === "/") {
    return null;
  }

  if (persistableProjectRouteSet.has(route)) {
    return {
      kind: "top-level",
      route: route as TopLevelProjectRoute,
    };
  }

  const chapterWorkspaceMatch = matchChapterWorkspaceRoute(route);
  if (chapterWorkspaceMatch) {
    return {
      kind: "chapter",
      route: route as ChapterWorkspaceRoute,
      chapterId: chapterWorkspaceMatch[1],
    };
  }

  const sceneWorkspaceMatch = matchSceneWorkspaceRoute(route);
  if (sceneWorkspaceMatch) {
    return {
      kind: "scene",
      route: route as SceneWorkspaceRoute,
      sceneId: sceneWorkspaceMatch[1],
    };
  }

  return null;
}

export function normalizeProjectRoute(
  route: string | null | undefined,
): PersistableProjectRoute {
  const matchedRoute = matchProjectRoute(route);

  if (!matchedRoute) {
    return DEFAULT_PROJECT_ROUTE;
  }

  if (matchedRoute.kind === "top-level") {
    return matchedRoute.route;
  }

  return matchedRoute.kind === "chapter"
    ? matchedRoute.route
    : DEFAULT_PROJECT_ROUTE;
}

export function shouldPersistProjectRoute(
  route: string,
): route is PersistableProjectRoute {
  return persistableProjectRouteSet.has(route) || Boolean(matchChapterWorkspaceRoute(route));
}

type RouteValidationSnapshot = Pick<ProjectSnapshot, "chapters" | "scenes">;

export function resolveProjectRouteNavigation(route: string | null | undefined):
  | { to: TopLevelProjectRoute }
  | { to: "/chapters/$chapterId"; params: { chapterId: string } }
  | { to: "/scenes/$sceneId"; params: { sceneId: string } };
export function resolveProjectRouteNavigation(
  route: string | null | undefined,
  snapshot: RouteValidationSnapshot,
):
  | { to: TopLevelProjectRoute }
  | { to: "/chapters/$chapterId"; params: { chapterId: string } }
  | { to: "/scenes/$sceneId"; params: { sceneId: string } };
export function resolveProjectRouteNavigation(
  route: string | null | undefined,
  snapshot?: RouteValidationSnapshot,
):
  | { to: TopLevelProjectRoute }
  | { to: "/chapters/$chapterId"; params: { chapterId: string } }
  | { to: "/scenes/$sceneId"; params: { sceneId: string } } {
  const matchedRoute = matchProjectRoute(route);

  if (!matchedRoute) {
    return { to: DEFAULT_PROJECT_ROUTE };
  }

  if (matchedRoute.kind === "top-level") {
    return { to: matchedRoute.route };
  }

  if (matchedRoute.kind === "chapter") {
    if (snapshot && !snapshot.chapters.some((chapter) => chapter.id === matchedRoute.chapterId)) {
      return { to: "/chapters" };
    }

    return {
      to: "/chapters/$chapterId",
      params: {
        chapterId: matchedRoute.chapterId,
      },
    };
  }

  if (snapshot && !snapshot.scenes.some((scene) => scene.id === matchedRoute.sceneId)) {
    return { to: "/scenes" };
  }

  return {
    to: "/scenes/$sceneId",
    params: {
      sceneId: matchedRoute.sceneId,
    },
  };
}
