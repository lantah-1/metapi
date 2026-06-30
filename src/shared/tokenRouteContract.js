export const ROUTE_DECISION_REFRESH_TASK_TYPE = 'route-decision.refresh';
export const SWITCH_GROUP_ACTIVE_SOURCE_ROUTE_ID_KEY = 'activeSourceRouteId';
export const SWITCH_GROUP_ACTIVE_SOURCE_SITE_ID_KEY = 'activeSourceSiteId';

export function normalizeTokenRouteMode(routeMode) {
    if (routeMode === 'explicit_group') return 'explicit_group';
    if (routeMode === 'switch_group') return 'switch_group';
    return 'pattern';
}

function parseModelMappingRecord(modelMapping) {
    if (!modelMapping) return null;
    if (typeof modelMapping === 'object' && !Array.isArray(modelMapping)) {
        return modelMapping;
    }
    if (typeof modelMapping !== 'string') return null;
    try {
        const parsed = JSON.parse(modelMapping);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function normalizePositiveInteger(input) {
    const value = Number(input);
    if (!Number.isFinite(value)) return null;
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
}

export function getSwitchGroupActiveSourceRouteId(modelMapping) {
    const parsed = parseModelMappingRecord(modelMapping);
    if (!parsed) return null;
    return normalizePositiveInteger(parsed[SWITCH_GROUP_ACTIVE_SOURCE_ROUTE_ID_KEY]);
}

export function getSwitchGroupActiveSourceSiteId(modelMapping) {
    const parsed = parseModelMappingRecord(modelMapping);
    if (!parsed) return null;
    return normalizePositiveInteger(parsed[SWITCH_GROUP_ACTIVE_SOURCE_SITE_ID_KEY]);
}

export function serializeSwitchGroupModelMapping(modelMapping, activeSourceRouteId, activeSourceSiteId) {
    const parsed = parseModelMappingRecord(modelMapping);
    const next = parsed ? { ...parsed } : {};
    const normalized = normalizePositiveInteger(activeSourceRouteId);
    if (normalized) {
        next[SWITCH_GROUP_ACTIVE_SOURCE_ROUTE_ID_KEY] = normalized;
    } else {
        delete next[SWITCH_GROUP_ACTIVE_SOURCE_ROUTE_ID_KEY];
    }
    const normalizedSiteId = normalizePositiveInteger(activeSourceSiteId);
    if (normalizedSiteId) {
        next[SWITCH_GROUP_ACTIVE_SOURCE_SITE_ID_KEY] = normalizedSiteId;
    } else {
        delete next[SWITCH_GROUP_ACTIVE_SOURCE_SITE_ID_KEY];
    }
    return JSON.stringify(next);
}
