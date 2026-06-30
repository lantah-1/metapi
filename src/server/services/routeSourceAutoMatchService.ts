import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { normalizeTokenRouteMode } from '../../shared/tokenRouteContract.js';

function isExactModelPattern(modelPattern: string): boolean {
  const normalized = modelPattern.trim();
  if (!normalized) return false;
  if (normalized.toLowerCase().startsWith('re:')) return false;
  return !/[\*\?]/.test(normalized);
}

function normalizeAutoSourceQuery(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function normalizeAutoSourceComparable(input: string): string {
  return input.trim().toLowerCase();
}

function getAutoSourceModelAlias(modelName: string): string {
  const normalized = normalizeAutoSourceComparable(modelName);
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    return normalized.slice(slashIndex + 1);
  }
  return normalized;
}

export function matchesAutoSourceQuery(modelName: string, query: string): boolean {
  const normalizedModel = normalizeAutoSourceComparable(modelName);
  const normalizedQuery = normalizeAutoSourceComparable(query);
  if (!normalizedModel || !normalizedQuery) return false;
  if (normalizedModel === normalizedQuery) return true;
  if (getAutoSourceModelAlias(normalizedModel) === normalizedQuery) return true;
  if (normalizedModel.endsWith(`/${normalizedQuery}`)) return true;
  return normalizedQuery.length >= 4 && normalizedModel.includes(normalizedQuery);
}

type AutoMatchRouteRow = Pick<
  typeof schema.tokenRoutes.$inferSelect,
  'id' | 'modelPattern' | 'displayName' | 'routeMode' | 'enabled'
>;

function isPublicGroupRoute(route: Pick<AutoMatchRouteRow, 'routeMode'>): boolean {
  const routeMode = normalizeTokenRouteMode(route.routeMode);
  return routeMode === 'explicit_group' || routeMode === 'switch_group';
}

function resolveAutoSourceRouteIdsFromRoutes(
  routes: AutoMatchRouteRow[],
  queryInput: unknown,
  currentRouteId?: number,
): number[] {
  const query = normalizeAutoSourceQuery(queryInput);
  if (!query) return [];

  return routes
    .filter((route) => (
      route.enabled
      && route.id !== currentRouteId
      && !isPublicGroupRoute(route)
      && isExactModelPattern(route.modelPattern)
      && matchesAutoSourceQuery(route.modelPattern, query)
    ))
    .sort((left, right) => left.modelPattern.localeCompare(right.modelPattern, undefined, { sensitivity: 'base' }))
    .map((route) => route.id)
    .slice(0, 500);
}

export async function resolveAutoSourceRouteIds(queryInput: unknown, currentRouteId?: number): Promise<number[]> {
  const query = normalizeAutoSourceQuery(queryInput);
  if (!query) return [];

  const routes = await db.select({
    id: schema.tokenRoutes.id,
    modelPattern: schema.tokenRoutes.modelPattern,
    displayName: schema.tokenRoutes.displayName,
    routeMode: schema.tokenRoutes.routeMode,
    enabled: schema.tokenRoutes.enabled,
  }).from(schema.tokenRoutes).all();

  return resolveAutoSourceRouteIdsFromRoutes(routes, query, currentRouteId);
}

export type SyncExplicitGroupSourcesFromAutoMatchResult = {
  updatedGroups: number;
  addedSourceRoutes: number;
  removedSourceRoutes: number;
};

export async function syncExplicitGroupSourcesFromAutoMatch(): Promise<SyncExplicitGroupSourcesFromAutoMatchResult> {
  const routes = await db.select({
    id: schema.tokenRoutes.id,
    modelPattern: schema.tokenRoutes.modelPattern,
    displayName: schema.tokenRoutes.displayName,
    routeMode: schema.tokenRoutes.routeMode,
    enabled: schema.tokenRoutes.enabled,
  }).from(schema.tokenRoutes).all();
  const explicitGroups = routes.filter((route) => normalizeTokenRouteMode(route.routeMode) === 'explicit_group');
  if (explicitGroups.length === 0) {
    return { updatedGroups: 0, addedSourceRoutes: 0, removedSourceRoutes: 0 };
  }

  const existingSources = await db.select({
    groupRouteId: schema.routeGroupSources.groupRouteId,
    sourceRouteId: schema.routeGroupSources.sourceRouteId,
  }).from(schema.routeGroupSources)
    .where(inArray(schema.routeGroupSources.groupRouteId, explicitGroups.map((route) => route.id)))
    .all();
  const existingSourceIdsByGroupId = new Map<number, Set<number>>();
  for (const row of existingSources) {
    if (!existingSourceIdsByGroupId.has(row.groupRouteId)) {
      existingSourceIdsByGroupId.set(row.groupRouteId, new Set());
    }
    existingSourceIdsByGroupId.get(row.groupRouteId)!.add(row.sourceRouteId);
  }
  const validSourceRouteIds = new Set(routes
    .filter((route) => (
      !isPublicGroupRoute(route)
      && isExactModelPattern(route.modelPattern)
    ))
    .map((route) => route.id));

  let updatedGroups = 0;
  let addedSourceRoutes = 0;
  let removedSourceRoutes = 0;
  for (const group of explicitGroups) {
    const query = group.displayName || group.modelPattern;
    const matchedSourceRouteIds = resolveAutoSourceRouteIdsFromRoutes(routes, query, group.id);
    const existingSourceIds = existingSourceIdsByGroupId.get(group.id) ?? new Set();
    const sourceRouteIdsToAdd = matchedSourceRouteIds.filter((sourceRouteId) => !existingSourceIds.has(sourceRouteId));
    const sourceRouteIdsToRemove = Array.from(existingSourceIds).filter((sourceRouteId) => (
      !validSourceRouteIds.has(sourceRouteId)
    ));

    if (sourceRouteIdsToRemove.length > 0) {
      for (const sourceRouteId of sourceRouteIdsToRemove) {
        await db.delete(schema.routeGroupSources)
          .where(and(
            eq(schema.routeGroupSources.groupRouteId, group.id),
            eq(schema.routeGroupSources.sourceRouteId, sourceRouteId),
          ))
          .run();
      }
      removedSourceRoutes += sourceRouteIdsToRemove.length;
    }

    if (sourceRouteIdsToAdd.length > 0) {
      await db.insert(schema.routeGroupSources).values(
        sourceRouteIdsToAdd.map((sourceRouteId) => ({
          groupRouteId: group.id,
          sourceRouteId,
        })),
      ).run();
      addedSourceRoutes += sourceRouteIdsToAdd.length;
    }

    if (sourceRouteIdsToAdd.length > 0 || sourceRouteIdsToRemove.length > 0) {
      updatedGroups += 1;
    }
  }

  return { updatedGroups, addedSourceRoutes, removedSourceRoutes };
}
