export const DEFAULT_PROJECT_ROUTE = "/chapters";
const PERSISTABLE_PROJECT_ROUTES = new Set([
  "/chapters",
  "/scenes",
  "/characters",
  "/suggestions",
  "/scratchpad",
]);

export function normalizeProjectRoute(route: string | null | undefined) {
  return route && PERSISTABLE_PROJECT_ROUTES.has(route)
    ? route
    : DEFAULT_PROJECT_ROUTE;
}

export function shouldPersistProjectRoute(route: string) {
  return PERSISTABLE_PROJECT_ROUTES.has(route);
}
