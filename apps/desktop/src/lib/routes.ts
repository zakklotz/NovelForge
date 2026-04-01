export const TOP_LEVEL_PROJECT_ROUTES = [
  "/chapters",
  "/scenes",
  "/characters",
  "/suggestions",
  "/scratchpad",
] as const;

export type TopLevelProjectRoute = (typeof TOP_LEVEL_PROJECT_ROUTES)[number];
export type ChapterWorkspaceRoute = `/chapters/${string}`;
export type PersistableProjectRoute =
  | TopLevelProjectRoute
  | ChapterWorkspaceRoute;

export const DEFAULT_PROJECT_ROUTE: TopLevelProjectRoute = "/chapters";

const persistableProjectRouteSet = new Set<string>(TOP_LEVEL_PROJECT_ROUTES);
const chapterWorkspaceRoutePattern = /^\/chapters\/([^/]+)$/;

function matchChapterWorkspaceRoute(route: string) {
  return chapterWorkspaceRoutePattern.exec(route);
}

export function normalizeProjectRoute(
  route: string | null | undefined,
): PersistableProjectRoute {
  if (!route || route === "/") {
    return DEFAULT_PROJECT_ROUTE;
  }

  if (persistableProjectRouteSet.has(route)) {
    return route as TopLevelProjectRoute;
  }

  return matchChapterWorkspaceRoute(route)
    ? (route as ChapterWorkspaceRoute)
    : DEFAULT_PROJECT_ROUTE;
}

export function shouldPersistProjectRoute(
  route: string,
): route is PersistableProjectRoute {
  return persistableProjectRouteSet.has(route) || Boolean(matchChapterWorkspaceRoute(route));
}

export function resolveProjectRouteNavigation(route: string | null | undefined):
  | { to: TopLevelProjectRoute }
  | { to: "/chapters/$chapterId"; params: { chapterId: string } } {
  const normalizedRoute = normalizeProjectRoute(route);
  const chapterWorkspaceMatch = matchChapterWorkspaceRoute(normalizedRoute);

  if (chapterWorkspaceMatch) {
    return {
      to: "/chapters/$chapterId",
      params: {
        chapterId: chapterWorkspaceMatch[1],
      },
    };
  }

  return { to: normalizedRoute as TopLevelProjectRoute };
}
