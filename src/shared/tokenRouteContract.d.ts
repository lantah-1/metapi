export declare const ROUTE_DECISION_REFRESH_TASK_TYPE = "route-decision.refresh";
export declare const SWITCH_GROUP_ACTIVE_SOURCE_ROUTE_ID_KEY = "activeSourceRouteId";
export declare const SWITCH_GROUP_ACTIVE_SOURCE_SITE_ID_KEY = "activeSourceSiteId";
export type RouteMode = 'pattern' | 'explicit_group' | 'switch_group';
export type RouteDecisionCandidate = {
    channelId: number;
    accountId: number;
    username: string;
    siteName: string;
    tokenName: string;
    priority: number;
    weight: number;
    eligible: boolean;
    recentlyFailed: boolean;
    avoidedByRecentFailure: boolean;
    probability: number;
    reason: string;
};
export type RouteDecision = {
    requestedModel: string;
    actualModel: string;
    matched: boolean;
    selectedChannelId?: number;
    selectedLabel?: string;
    summary: string[];
    candidates: RouteDecisionCandidate[];
};
export declare function normalizeTokenRouteMode(routeMode: unknown): RouteMode;
export declare function getSwitchGroupActiveSourceRouteId(modelMapping?: string | Record<string, unknown> | null): number | null;
export declare function getSwitchGroupActiveSourceSiteId(modelMapping?: string | Record<string, unknown> | null): number | null;
export declare function serializeSwitchGroupModelMapping(
  modelMapping: string | Record<string, unknown> | null | undefined,
  activeSourceRouteId: number | null | undefined,
  activeSourceSiteId?: number | null | undefined,
): string;
