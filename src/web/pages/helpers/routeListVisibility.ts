import { normalizeTokenRouteMode, type RouteMode } from '../../../shared/tokenRouteContract.js';

export type RouteListVisibilityItem = {
  id: number;
  modelPattern: string;
  displayName?: string | null;
  routeMode?: string | null;
  sourceRouteIds?: number[];
  enabled: boolean;
};

function normalizeRouteMode(routeMode: string | null | undefined): RouteMode {
  return normalizeTokenRouteMode(routeMode);
}

function isPublicGroupRoute(route: Pick<RouteListVisibilityItem, 'routeMode'>): boolean {
  const routeMode = normalizeRouteMode(route.routeMode);
  return routeMode === 'explicit_group' || routeMode === 'switch_group';
}

function hasCustomDisplayName(route: Pick<RouteListVisibilityItem, 'modelPattern' | 'displayName'>): boolean {
  const displayName = (route.displayName || '').trim();
  const modelPattern = (route.modelPattern || '').trim();
  return !!displayName && displayName !== modelPattern;
}

export function buildVisibleRouteList<T extends RouteListVisibilityItem>(
  routes: T[],
  isExactModelPattern: (pattern: string) => boolean,
  matchesModelPattern: (model: string, pattern: string) => boolean,
): T[] {
  const exactModelNames = new Set(
    routes
      .filter((route) => !isPublicGroupRoute(route) && isExactModelPattern(route.modelPattern))
      .map((route) => (route.modelPattern || '').trim())
      .filter(Boolean),
  );
  const coveringGroups = routes.filter((route) => (
    route.enabled
    && (
      (isPublicGroupRoute(route) && ((route.displayName || '').trim().length > 0) && (route.sourceRouteIds || []).length > 0)
      || (!isPublicGroupRoute(route) && !isExactModelPattern(route.modelPattern) && hasCustomDisplayName(route))
    )
  ));

  if (coveringGroups.length === 0) return routes;

  return routes.filter((route) => {
    if (isPublicGroupRoute(route)) return true;
    if (!isExactModelPattern(route.modelPattern)) return true;
    if (hasCustomDisplayName(route)) return true;

    const exactModel = (route.modelPattern || '').trim();
    if (!exactModel) return true;

    return !coveringGroups.some((groupRoute) => (
      groupRoute.id !== route.id
      && !exactModelNames.has((groupRoute.displayName || '').trim())
      && (
        (isPublicGroupRoute(groupRoute) && (groupRoute.sourceRouteIds || []).includes(route.id))
        || (!isPublicGroupRoute(groupRoute) && matchesModelPattern(exactModel, groupRoute.modelPattern))
      )
    ));
  });
}
