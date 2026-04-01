export const PERSISTABLE_PROJECT_ROUTES = [
  "/chapters",
  "/scenes",
  "/characters",
  "/suggestions",
  "/scratchpad",
] as const;

export type PersistableProjectRoute =
  (typeof PERSISTABLE_PROJECT_ROUTES)[number];

export const DEFAULT_PROJECT_ROUTE: PersistableProjectRoute = "/chapters";

const persistableProjectRouteSet = new Set<string>(PERSISTABLE_PROJECT_ROUTES);

export function normalizeProjectRoute(
  route: string | null | undefined,
): PersistableProjectRoute {
  return route && persistableProjectRouteSet.has(route)
    ? (route as PersistableProjectRoute)
    : DEFAULT_PROJECT_ROUTE;
}

export function shouldPersistProjectRoute(
  route: string,
): route is PersistableProjectRoute {
  return persistableProjectRouteSet.has(route);
}
