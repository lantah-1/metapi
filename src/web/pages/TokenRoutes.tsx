import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { BrandGlyph } from '../components/BrandIcon.js';
import ModernSelect from '../components/ModernSelect.js';
import { useToast } from '../components/Toast.js';
import {
  getRouteRoutingStrategyDescription,
  getRouteRoutingStrategyLabel,
  normalizeRouteRoutingStrategyValue,
} from './token-routes/routingStrategy.js';
import type { RouteHeaderTemplate, RouteRoutingStrategy, RouteSummaryRow } from './token-routes/types.js';
import {
  isPublicGroupRoute,
  isRouteExactModel,
  isSwitchGroupRoute,
  resolveRouteBrand,
  resolveRouteTitle,
} from './token-routes/utils.js';
import {
  getSwitchGroupActiveSourceRouteId,
  type RouteMode,
} from '../../shared/tokenRouteContract.js';
import {
  emptyCustomHeaderField,
  parseCustomHeadersForEditor,
  serializeCustomHeaders,
  type CustomHeaderField,
} from './helpers/customHeaders.js';

const STRATEGY_OPTIONS: Array<{
  value: RouteRoutingStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'weighted',
    label: getRouteRoutingStrategyLabel('weighted'),
    description: '综合权重、成本、健康度选择成员',
  },
  {
    value: 'round_robin',
    label: getRouteRoutingStrategyLabel('round_robin'),
    description: '按成员顺序轮流请求',
  },
  {
    value: 'stable_first',
    label: getRouteRoutingStrategyLabel('stable_first'),
    description: '优先复用稳定供应商，异常时切换',
  },
];

type GroupForm = {
  mode: Extract<RouteMode, 'explicit_group' | 'switch_group'>;
  name: string;
  autoQuery: string;
  routingStrategy: RouteRoutingStrategy;
  sourceRouteIds: number[];
  activeSourceRouteId: number | null;
  activeSourceSiteId: number | null;
  customHeaderTemplateId: number | null;
  customHeaders: CustomHeaderField[];
  enabled: boolean;
};

type SwitchTargetSourceKind = 'group' | 'provider';

type SwitchTargetSourceOption = {
  value: string;
  kind: SwitchTargetSourceKind;
  label: string;
  description: string;
  targets: SwitchTargetOption[];
};

type SwitchTargetOption = {
  value: string;
  route: RouteSummaryRow;
  siteId: number | null;
  supplierName: string;
  supplierStatus: string;
  supplierChannelCount: number;
  supplierEnabledChannelCount: number;
};

const EMPTY_FORM: GroupForm = {
  mode: 'explicit_group',
  name: '',
  autoQuery: '',
  routingStrategy: 'stable_first',
  sourceRouteIds: [],
  activeSourceRouteId: null,
  activeSourceSiteId: null,
  customHeaderTemplateId: null,
  customHeaders: [emptyCustomHeaderField()],
  enabled: true,
};

const DESKTOP_DETAIL_COLLAPSE_MS = 200;

function prefersReducedMotion(): boolean {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DesktopDetailPanelPresence({
  open,
  children,
}: {
  open: boolean;
  children: (closing: boolean) => JSX.Element;
}) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
      return undefined;
    }

    if (prefersReducedMotion()) {
      setShouldRender(false);
      setIsClosing(false);
      return undefined;
    }

    setIsClosing(true);
    const timerId = globalThis.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, DESKTOP_DETAIL_COLLAPSE_MS);
    return () => globalThis.clearTimeout(timerId);
  }, [open]);

  if (!shouldRender) return null;
  return (
    <div className={`route-detail-panel-presence ${open ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`.trim()}>
      {children(isClosing)}
    </div>
  );
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}

function getModelAlias(modelName: string): string {
  const normalized = normalizeComparable(modelName);
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    return normalized.slice(slashIndex + 1);
  }
  return normalized;
}

function sourceModelMatchesQuery(modelName: string, query: string): boolean {
  const normalizedModel = normalizeComparable(modelName);
  const normalizedQuery = normalizeComparable(query);
  if (!normalizedModel || !normalizedQuery) return false;
  if (normalizedModel === normalizedQuery) return true;
  if (getModelAlias(normalizedModel) === normalizedQuery) return true;
  if (normalizedModel.endsWith(`/${normalizedQuery}`)) return true;
  return normalizedQuery.length >= 4 && normalizedModel.includes(normalizedQuery);
}

function buildGroupForm(route?: RouteSummaryRow | null): GroupForm {
  if (!route) return EMPTY_FORM;
  const name = resolveRouteTitle(route);
  const mode = isSwitchGroupRoute(route) ? 'switch_group' : 'explicit_group';
  const activeSourceRouteId = typeof route.activeSourceRouteId === 'number'
    ? route.activeSourceRouteId
    : getSwitchGroupActiveSourceRouteId(route.modelMapping);
  return {
    mode,
    name,
    autoQuery: name,
    routingStrategy: normalizeRouteRoutingStrategyValue(route.routingStrategy),
    sourceRouteIds: [...(route.sourceRouteIds || [])],
    activeSourceRouteId,
    activeSourceSiteId: route.activeSourceSiteId ?? null,
    customHeaderTemplateId: route.customHeaderTemplateId ?? null,
    customHeaders: parseCustomHeadersForEditor(route.customHeaders),
    enabled: route.enabled,
  };
}

function formatCount(count: number, unit: string): string {
  return `${Math.max(0, count)} ${unit}`;
}

function getSupplierNames(route: RouteSummaryRow): string[] {
  const names = route.siteNames
    .map((name) => name.trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

function countHeaderFields(fields: CustomHeaderField[]): number {
  return fields.filter((field) => field.key.trim().length > 0 || field.value.trim().length > 0).length;
}

function countSerializedHeaders(raw: unknown): number {
  return countHeaderFields(parseCustomHeadersForEditor(raw));
}

function getSupplierStatuses(route: RouteSummaryRow): Array<{
  key: string;
  name: string;
  status: string;
  channelCount: number;
  enabledChannelCount: number;
}> {
  if (Array.isArray(route.siteStatuses) && route.siteStatuses.length > 0) {
    const seen = new Set<string>();
    const suppliers: Array<{
      key: string;
      name: string;
      status: string;
      channelCount: number;
      enabledChannelCount: number;
    }> = [];
    for (const item of route.siteStatuses) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const id = typeof item.id === 'number' && Number.isFinite(item.id) ? Math.trunc(item.id) : null;
      const key = id != null ? `site:${id}` : `name:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fallbackChannelCount = route.siteStatuses.length === 1 ? route.channelCount : 0;
      const fallbackEnabledChannelCount = route.siteStatuses.length === 1 ? route.enabledChannelCount : 0;
      suppliers.push({
        key,
        name,
        status: String(item.status || 'active').trim() || 'active',
        channelCount: typeof item.channelCount === 'number' && Number.isFinite(item.channelCount)
          ? Math.max(0, Math.trunc(item.channelCount))
          : fallbackChannelCount,
        enabledChannelCount: typeof item.enabledChannelCount === 'number' && Number.isFinite(item.enabledChannelCount)
          ? Math.max(0, Math.trunc(item.enabledChannelCount))
          : fallbackEnabledChannelCount,
      });
    }
    return suppliers;
  }

  return getSupplierNames(route).map((name) => ({
    key: `name:${name.toLowerCase()}`,
    name,
    status: 'active',
    channelCount: 0,
    enabledChannelCount: 0,
  }));
}

function getGroupModeLabel(routeOrMode: Pick<RouteSummaryRow, 'routeMode'> | GroupForm['mode']): string {
  const routeMode = typeof routeOrMode === 'string' ? routeOrMode : routeOrMode.routeMode;
  return routeMode === 'switch_group' ? '切换分组' : '普通分组';
}

function getSourceTargetLabel(route: RouteSummaryRow): string {
  return isPublicGroupRoute(route) ? resolveRouteTitle(route) : route.modelPattern;
}

function getSourceTargetTypeLabel(route: RouteSummaryRow): string {
  if (isSwitchGroupRoute(route)) return '切换分组';
  return isPublicGroupRoute(route) ? '普通分组' : '供应商单模型';
}

function getSourceTargetSupplierSummary(route: RouteSummaryRow): string {
  const suppliers = getSupplierNames(route);
  if (suppliers.length <= 0) return '';
  const visible = suppliers.slice(0, 3).join('、');
  return suppliers.length > 3 ? `${visible} +${suppliers.length - 3}` : visible;
}

function getSourceTargetDescription(route: RouteSummaryRow): string {
  return [
    getSourceTargetTypeLabel(route),
    formatCount(route.enabledChannelCount, '可用通道'),
    getSourceTargetSupplierSummary(route),
  ].filter(Boolean).join(' / ');
}

function getSwitchTargetModelDescription(route: RouteSummaryRow): string {
  return [
    '精确模型',
    formatCount(route.enabledChannelCount, '可用通道'),
  ].join(' / ');
}

function getSwitchGroupTargetRoutes(
  routes: RouteSummaryRow[],
  currentRouteId?: number | null,
): RouteSummaryRow[] {
  return routes
    .filter((route) => !isSwitchGroupRoute(route) && route.id !== currentRouteId)
    .sort((left, right) => (
      getSourceTargetLabel(left).localeCompare(getSourceTargetLabel(right), undefined, { sensitivity: 'base' })
    ));
}

function getSwitchTargetModelTypePill(): ReactNode {
  return (
    <span className="model-group-target-kind-pill is-model">
      模型
    </span>
  );
}

function getSwitchSourceKindPill(kind: SwitchTargetSourceKind): ReactNode {
  return (
    <span className={`model-group-target-kind-pill ${kind === 'provider' ? 'is-provider' : 'is-group'}`.trim()}>
      {kind === 'provider' ? '供应商' : '分组'}
    </span>
  );
}

function getSwitchGroupSourceValue(routeId: number): string {
  return `group:${routeId}`;
}

function getSwitchProviderSourceValue(supplierKey: string): string {
  return `provider:${supplierKey}`;
}

function getSwitchTargetOptionValue(routeId: number, siteId: number | null): string {
  return `${routeId}:${siteId ?? 'unbound'}`;
}

function getSwitchTargetOptionLabel(target: SwitchTargetOption): string {
  return `${getSourceTargetLabel(target.route)} / ${target.supplierName}`;
}

function getSwitchTargetOptionDescription(target: SwitchTargetOption): string {
  return [
    '精确模型',
    formatCount(target.supplierEnabledChannelCount, '可用通道'),
    target.supplierStatus === 'disabled' ? '供应商已禁用' : '指定供应商',
  ].join(' / ');
}

function createSwitchTargetOptionsForRoute(route: RouteSummaryRow): SwitchTargetOption[] {
  const suppliers = getSupplierStatuses(route);
  const effectiveSuppliers = suppliers.length > 0
    ? suppliers
    : [{
      key: 'unbound',
      name: '未绑定供应商',
      status: 'active',
      channelCount: route.channelCount,
      enabledChannelCount: route.enabledChannelCount,
    }];
  return effectiveSuppliers.map((supplier) => {
    const rawSiteId = supplier.key.startsWith('site:')
      ? Number(supplier.key.slice('site:'.length))
      : null;
    const siteId = typeof rawSiteId === 'number' && Number.isFinite(rawSiteId) && rawSiteId > 0
      ? Math.trunc(rawSiteId)
      : null;
    return {
      value: getSwitchTargetOptionValue(route.id, siteId),
      route,
      siteId,
      supplierName: supplier.name,
      supplierStatus: supplier.status,
      supplierChannelCount: supplier.channelCount,
      supplierEnabledChannelCount: supplier.enabledChannelCount,
    };
  });
}

function getSwitchTargetSourceValue(route: RouteSummaryRow): string {
  if (isPublicGroupRoute(route)) return getSwitchGroupSourceValue(route.id);
  const suppliers = getSupplierStatuses(route);
  return getSwitchProviderSourceValue(suppliers[0]?.key || 'unbound');
}

function getRoutesForSwitchTargetSource(
  sources: SwitchTargetSourceOption[],
  sourceValue: string,
): SwitchTargetOption[] {
  return sources.find((source) => source.value === sourceValue)?.targets || [];
}

function getSwitchTargetOptionForRouteAndSite(
  targets: SwitchTargetOption[],
  routeId: number | null | undefined,
  siteId: number | null | undefined,
): SwitchTargetOption | null {
  if (!routeId) return null;
  return targets.find((target) => (
    target.route.id === routeId
    && (siteId == null || target.siteId === siteId)
  )) || targets.find((target) => target.route.id === routeId) || null;
}

function getSwitchTargetsFromSources(sources: SwitchTargetSourceOption[]): SwitchTargetOption[] {
  const seen = new Set<string>();
  const targets: SwitchTargetOption[] = [];
  for (const source of sources) {
    for (const target of source.targets) {
      if (seen.has(target.value)) continue;
      seen.add(target.value);
      targets.push(target);
    }
  }
  return targets;
}

function getSwitchTargetSourceOptionForRoute(
  sources: SwitchTargetSourceOption[],
  route: RouteSummaryRow | null,
  siteId?: number | null,
): SwitchTargetSourceOption | null {
  if (!route) return null;
  return sources.find((source) => source.targets.some((candidate) => (
    candidate.route.id === route.id
    && (siteId == null || candidate.siteId === siteId)
  )))
    || sources.find((source) => source.value === getSwitchTargetSourceValue(route))
    || sources.find((source) => source.targets.some((candidate) => candidate.route.id === route.id))
    || null;
}

function buildSwitchTargetSourceOptions(
  groupTargets: RouteSummaryRow[],
  modelTargets: RouteSummaryRow[],
): SwitchTargetSourceOption[] {
  const modelTargetById = new Map(modelTargets.map((route) => [route.id, route]));
  const groupOptions = groupTargets
    .map((route) => {
      const routes = sortSwitchTargetsByKind((route.sourceRouteIds || [])
        .map((routeId) => modelTargetById.get(routeId))
        .filter((item): item is RouteSummaryRow => !!item));
      const targets = routes.flatMap(createSwitchTargetOptionsForRoute);
      return {
        value: getSwitchGroupSourceValue(route.id),
        kind: 'group' as const,
        label: getSourceTargetLabel(route),
        description: getSourceTargetDescription(route),
        targets,
      };
    })
    .filter((source) => source.targets.length > 0);

  const providers = new Map<string, SwitchTargetSourceOption & { targetValueSet: Set<string> }>();
  for (const route of modelTargets) {
    for (const target of createSwitchTargetOptionsForRoute(route)) {
      const value = getSwitchProviderSourceValue(target.siteId ? `site:${target.siteId}` : 'unbound');
      const existing = providers.get(value);
      if (existing) {
        if (!existing.targetValueSet.has(target.value)) {
          existing.targets.push(target);
          existing.targetValueSet.add(target.value);
        }
        continue;
      }
      providers.set(value, {
        value,
        kind: 'provider',
        label: target.supplierName,
        description: '',
        targets: [target],
        targetValueSet: new Set([target.value]),
      });
    }
  }

  const providerOptions = Array.from(providers.values())
    .map(({ targetValueSet: _targetValueSet, ...source }) => {
      const targets = [...source.targets].sort((left, right) => (
        getSourceTargetLabel(left.route).localeCompare(getSourceTargetLabel(right.route), undefined, { sensitivity: 'base' })
      ));
      const enabledChannelCount = targets.reduce((total, target) => total + target.route.enabledChannelCount, 0);
      return {
        ...source,
        targets,
        description: `${formatCount(targets.length, '模型')} / ${formatCount(enabledChannelCount, '可用通道')}`,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

  return [...groupOptions, ...providerOptions];
}

function sourceTargetMatchesQuery(route: RouteSummaryRow, query: string): boolean {
  if (!query) return true;
  return [
    getSourceTargetLabel(route),
    getSourceTargetTypeLabel(route),
    resolveRouteTitle(route),
    route.siteNames.join(' '),
  ].join(' ').toLowerCase().includes(query);
}

function sortSourceTargets(routes: RouteSummaryRow[], selectedRouteIds: Set<number>): RouteSummaryRow[] {
  return [...routes].sort((left, right) => {
    const leftSelected = selectedRouteIds.has(left.id) ? 0 : 1;
    const rightSelected = selectedRouteIds.has(right.id) ? 0 : 1;
    if (leftSelected !== rightSelected) return leftSelected - rightSelected;
    return getSourceTargetLabel(left).localeCompare(getSourceTargetLabel(right), undefined, { sensitivity: 'base' });
  });
}

function sortSwitchTargetsByKind(routes: RouteSummaryRow[]): RouteSummaryRow[] {
  return [...routes].sort((left, right) => {
    const leftKind = isPublicGroupRoute(left) ? 0 : 1;
    const rightKind = isPublicGroupRoute(right) ? 0 : 1;
    if (leftKind !== rightKind) return leftKind - rightKind;
    return getSourceTargetLabel(left).localeCompare(getSourceTargetLabel(right), undefined, { sensitivity: 'base' });
  });
}

function filterAndSortSourceTargets(
  routes: RouteSummaryRow[],
  sourceSearch: string,
  selectedRouteIds: Set<number>,
): RouteSummaryRow[] {
  const query = normalizeComparable(sourceSearch);
  return sortSourceTargets(routes.filter((route) => sourceTargetMatchesQuery(route, query)), selectedRouteIds);
}

function ModelGlyph({ model, size = 20 }: { model: string; size?: number }) {
  return (
    <BrandGlyph
      model={model}
      size={size}
      fallbackText={model}
      style={{ borderRadius: Math.max(5, Math.round(size * 0.3)) }}
    />
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="model-group-field-label">{children}</div>;
}

function SourceToolIcon({ type }: { type: 'select' | 'clear' }) {
  if (type === 'select') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4.5 10.5 8 14l7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 5.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BodyPortal({ children }: { children: ReactNode }) {
  const canUsePortal = typeof document !== 'undefined'
    && !!document.body
    && typeof document.body.appendChild === 'function'
    && typeof document.body.removeChild === 'function';

  useEffect(() => {
    if (!canUsePortal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [canUsePortal]);

  return canUsePortal ? createPortal(children, document.body) : <>{children}</>;
}

export default function TokenRoutes() {
  const toast = useToast();
  const [routes, setRoutes] = useState<RouteSummaryRow[]>([]);
  const [headerTemplates, setHeaderTemplates] = useState<RouteHeaderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [quickSwitchingRouteId, setQuickSwitchingRouteId] = useState<number | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [switchTargetSourceValue, setSwitchTargetSourceValue] = useState('');
  const [quickSwitchSourceValueByRouteId, setQuickSwitchSourceValueByRouteId] = useState<Record<number, string>>({});
  const [expandedGroupIds, setExpandedGroupIds] = useState<number[]>([]);
  const mountedRef = useRef(true);

  const load = async () => {
    const [rows, templates] = await Promise.all([
      api.getRoutesSummary(),
      api.getRouteHeaderTemplates(),
    ]);
    if (!mountedRef.current) return;
    setRoutes((rows || []) as RouteSummaryRow[]);
    setHeaderTemplates((templates || []) as RouteHeaderTemplate[]);
  };

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        setLoading(true);
        await load();
      } catch (error: any) {
        toast.error(error?.message || '加载模型分组失败');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [toast]);

  const exactRoutes = useMemo(
    () => routes
      .filter((route) => isRouteExactModel(route))
      .sort((left, right) => left.modelPattern.localeCompare(right.modelPattern, undefined, { sensitivity: 'base' })),
    [routes],
  );

  const groupRoutes = useMemo(
    () => routes
      .filter((route) => isPublicGroupRoute(route))
      .sort((left, right) => resolveRouteTitle(left).localeCompare(resolveRouteTitle(right), undefined, { sensitivity: 'base' })),
    [routes],
  );

  useEffect(() => {
    const validGroupIds = new Set(groupRoutes.map((route) => route.id));
    setExpandedGroupIds((prev) => prev.filter((routeId) => validGroupIds.has(routeId)));
  }, [groupRoutes]);

  const routeById = useMemo(() => {
    const map = new Map<number, RouteSummaryRow>();
    for (const route of routes) map.set(route.id, route);
    return map;
  }, [routes]);

  const editingRoute = editingRouteId ? routeById.get(editingRouteId) || null : null;
  const selectedSourceIdSet = useMemo(() => new Set(form.sourceRouteIds), [form.sourceRouteIds]);
  const expandedGroupIdSet = useMemo(() => new Set(expandedGroupIds), [expandedGroupIds]);
  const exactRouteIdSet = useMemo(() => new Set(exactRoutes.map((route) => route.id)), [exactRoutes]);
  const headerTemplateOptions = useMemo(() => [
    { value: '', label: '不使用模板', description: '仅使用此分组自定义 Header' },
    ...headerTemplates.map((template) => ({
      value: String(template.id),
      label: template.name,
      description: template.description || `${countSerializedHeaders(template.headers)} 个 Header`,
    })),
  ], [headerTemplates]);
  const switchHeaderTemplateOptions = useMemo(() => [
    { value: '', label: '不使用模板', description: '沿用当前指向目标的 Header 处理' },
    ...headerTemplates.map((template) => ({
      value: String(template.id),
      label: template.name,
      description: template.description || `${countSerializedHeaders(template.headers)} 个 Header`,
    })),
  ], [headerTemplates]);
  const selectedHeaderTemplate = useMemo(
    () => headerTemplates.find((template) => template.id === form.customHeaderTemplateId) || null,
    [form.customHeaderTemplateId, headerTemplates],
  );
  const activeQuery = (form.autoQuery || form.name).trim();
  const autoMatchedIds = useMemo(
    () => exactRoutes
      .filter((route) => sourceModelMatchesQuery(route.modelPattern, activeQuery))
      .map((route) => route.id),
    [activeQuery, exactRoutes],
  );
  const switchGroupTargetRoutes = useMemo(
    () => getSwitchGroupTargetRoutes(groupRoutes, editingRouteId),
    [editingRouteId, groupRoutes],
  );
  const switchModelTargetRoutes = exactRoutes;
  const switchTargetSourceOptions = useMemo(
    () => buildSwitchTargetSourceOptions(switchGroupTargetRoutes, switchModelTargetRoutes),
    [switchGroupTargetRoutes, switchModelTargetRoutes],
  );
  const sourceCandidateRoutes = exactRoutes;

  const filteredSourceRoutes = useMemo(
    () => filterAndSortSourceTargets(sourceCandidateRoutes, sourceSearch, selectedSourceIdSet),
    [selectedSourceIdSet, sourceCandidateRoutes, sourceSearch],
  );
  const visibleSourceRoutes = useMemo(
    () => filteredSourceRoutes,
    [filteredSourceRoutes],
  );

  const filteredGroups = useMemo(() => {
    const query = normalizeComparable(search);
    if (!query) return groupRoutes;
    return groupRoutes.filter((route) => {
      const sourceText = (route.sourceRouteIds || [])
        .map((routeId) => routeById.get(routeId)?.modelPattern || '')
        .join(' ');
      return [
        resolveRouteTitle(route),
        route.modelPattern,
        route.siteNames.join(' '),
        sourceText,
      ].join(' ').toLowerCase().includes(query);
    });
  }, [groupRoutes, routeById, search]);
  const filteredSwitchGroups = useMemo(
    () => filteredGroups.filter((route) => isSwitchGroupRoute(route)),
    [filteredGroups],
  );
  const filteredNormalGroups = useMemo(
    () => filteredGroups.filter((route) => !isSwitchGroupRoute(route)),
    [filteredGroups],
  );
  const switchGroupCount = groupRoutes.filter((route) => isSwitchGroupRoute(route)).length;
  const normalGroupCount = groupRoutes.length - switchGroupCount;
  const showSeparatedGroupSections = switchGroupCount > 0;

  const selectedSourceRoutes = useMemo(
    () => form.sourceRouteIds
      .map((routeId) => routeById.get(routeId))
      .filter((route): route is RouteSummaryRow => !!route),
    [form.sourceRouteIds, routeById],
  );
  const activeTargetRoute = form.activeSourceRouteId ? routeById.get(form.activeSourceRouteId) || null : null;
  const activeSwitchTargetSourceOption = getSwitchTargetSourceOptionForRoute(
    switchTargetSourceOptions,
    activeTargetRoute,
    form.activeSourceSiteId,
  );
  const selectedSwitchTargetSourceValue = switchTargetSourceValue
    || activeSwitchTargetSourceOption?.value
    || '';
  const selectedSwitchTargetSourceTargets = useMemo(
    () => getRoutesForSwitchTargetSource(switchTargetSourceOptions, selectedSwitchTargetSourceValue),
    [selectedSwitchTargetSourceValue, switchTargetSourceOptions],
  );
  const activeSwitchTarget = getSwitchTargetOptionForRouteAndSite(
    selectedSwitchTargetSourceTargets.length > 0
      ? selectedSwitchTargetSourceTargets
      : getSwitchTargetsFromSources(switchTargetSourceOptions),
    activeTargetRoute?.id ?? null,
    form.activeSourceSiteId,
  );

  const totalMemberRoutes = groupRoutes.reduce((total, route) => total + (route.sourceRouteIds?.length || 0), 0);
  const totalEnabledGroups = groupRoutes.filter((route) => route.enabled).length;

  const startCreate = () => {
    setEditingRouteId(null);
    setForm(EMPTY_FORM);
    setSourceSearch('');
    setSwitchTargetSourceValue('');
    setEditorOpen(true);
  };

  const startEdit = (route: RouteSummaryRow) => {
    setEditingRouteId(route.id);
    const nextForm = buildGroupForm(route);
    setForm(nextForm);
    setSourceSearch('');
    const activeTarget = nextForm.activeSourceRouteId ? routeById.get(nextForm.activeSourceRouteId) || null : null;
    setSwitchTargetSourceValue(getSwitchTargetSourceOptionForRoute(
      switchTargetSourceOptions,
      activeTarget,
      nextForm.activeSourceSiteId,
    )?.value || '');
    setExpandedGroupIds((prev) => (prev.includes(route.id) ? prev : [...prev, route.id]));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditingRouteId(null);
    setForm(EMPTY_FORM);
    setSourceSearch('');
    setSwitchTargetSourceValue('');
  };

  useEffect(() => {
    if (!editorOpen) return undefined;
    if (
      typeof globalThis.addEventListener !== 'function'
      || typeof globalThis.removeEventListener !== 'function'
    ) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      setEditorOpen(false);
      setEditingRouteId(null);
      setForm(EMPTY_FORM);
      setSourceSearch('');
      setSwitchTargetSourceValue('');
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [editorOpen, saving]);

  const updateGroupMode = (mode: GroupForm['mode']) => {
    if (mode !== 'switch_group') {
      setSwitchTargetSourceValue('');
    } else {
      const nextSwitchTargetId = form.activeSourceRouteId && form.sourceRouteIds.includes(form.activeSourceRouteId)
        ? form.activeSourceRouteId
        : (form.sourceRouteIds[0] ?? null);
      const nextTarget = nextSwitchTargetId ? routeById.get(nextSwitchTargetId) || null : null;
      setSwitchTargetSourceValue(getSwitchTargetSourceOptionForRoute(
        switchTargetSourceOptions,
        nextTarget,
        form.activeSourceSiteId,
      )?.value || '');
    }
    setForm((prev) => {
      if (prev.mode === mode) return prev;
      const nextSwitchTargetId = mode === 'switch_group'
        ? (prev.activeSourceRouteId && prev.sourceRouteIds.includes(prev.activeSourceRouteId)
          ? prev.activeSourceRouteId
          : (prev.sourceRouteIds[0] ?? null))
        : null;
      const sourceRouteIds = mode === 'explicit_group'
        ? prev.sourceRouteIds.filter((routeId) => exactRouteIdSet.has(routeId))
        : (nextSwitchTargetId ? [nextSwitchTargetId] : []);
      const activeSourceRouteId = mode === 'switch_group'
        ? nextSwitchTargetId
        : null;
      return {
        ...prev,
        mode,
        sourceRouteIds,
        activeSourceRouteId,
        activeSourceSiteId: mode === 'switch_group' ? prev.activeSourceSiteId : null,
        customHeaderTemplateId: prev.customHeaderTemplateId,
        customHeaders: mode === 'switch_group' ? [emptyCustomHeaderField()] : prev.customHeaders,
      };
    });
  };

  const toggleGroupExpanded = (routeId: number) => {
    setExpandedGroupIds((prev) => (
      prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId]
    ));
  };

  const shouldIgnoreGroupCardClick = (target: EventTarget | null) => {
    const candidate = target as {
      closest?: (selector: string) => Element | null;
      parentElement?: Element | null;
    } | null;
    const selector = [
      'button',
      'a',
      'input',
      'select',
      'textarea',
      'label',
      '[role="button"]',
      '.model-group-card-actions',
      '.model-group-detail',
    ].join(',');
    const matched = typeof candidate?.closest === 'function'
      ? candidate.closest(selector)
      : candidate?.parentElement?.closest(selector);
    return !!matched;
  };

  const handleGroupCardClick = (routeId: number, event: ReactMouseEvent<HTMLElement>) => {
    if (shouldIgnoreGroupCardClick(event.target)) return;
    toggleGroupExpanded(routeId);
  };

  const applyAutoMatch = () => {
    if (!activeQuery) {
      toast.error('先填写分组模型名或自动匹配关键词');
      return;
    }
    if (autoMatchedIds.length === 0) {
      toast.error('没有匹配到可加入分组的来源模型');
      return;
    }
    setForm((prev) => ({
      ...prev,
        sourceRouteIds: prev.mode === 'switch_group' ? (autoMatchedIds[0] ? [autoMatchedIds[0]] : []) : autoMatchedIds,
        activeSourceRouteId: prev.mode === 'switch_group' ? (autoMatchedIds[0] ?? null) : prev.activeSourceRouteId,
        activeSourceSiteId: prev.mode === 'switch_group' ? null : prev.activeSourceSiteId,
    }));
    toast.success(`已匹配 ${autoMatchedIds.length} 个来源模型`);
  };

  const toggleSourceRoute = (routeId: number) => {
    setForm((prev) => {
      if (prev.mode === 'switch_group') {
        return {
          ...prev,
          sourceRouteIds: [routeId],
          activeSourceRouteId: routeId,
          activeSourceSiteId: null,
        };
      }
      const next = new Set(prev.sourceRouteIds);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      const sourceRouteIds = Array.from(next);
      return {
        ...prev,
        sourceRouteIds,
        activeSourceRouteId: prev.activeSourceRouteId,
      };
    });
  };

  const selectSourceRoutes = (routeIds: number[]) => {
    const normalizedRouteIds = Array.from(new Set(
      routeIds.filter((routeId) => Number.isFinite(routeId) && routeId > 0),
    ));
    if (normalizedRouteIds.length === 0) return;
    setForm((prev) => {
      if (prev.mode === 'switch_group') {
        const targetRouteId = normalizedRouteIds[0] ?? null;
        return targetRouteId
          ? {
            ...prev,
            sourceRouteIds: [targetRouteId],
            activeSourceRouteId: targetRouteId,
            activeSourceSiteId: null,
          }
          : prev;
      }
      const next = new Set(prev.sourceRouteIds);
      for (const routeId of normalizedRouteIds) next.add(routeId);
      const sourceRouteIds = Array.from(next);
      return {
        ...prev,
        sourceRouteIds,
        activeSourceRouteId: prev.activeSourceRouteId,
      };
    });
  };

  const clearSourceRoutes = () => {
    setForm((prev) => ({
      ...prev,
      sourceRouteIds: [],
      activeSourceRouteId: prev.mode === 'switch_group' ? null : prev.activeSourceRouteId,
      activeSourceSiteId: prev.mode === 'switch_group' ? null : prev.activeSourceSiteId,
    }));
  };

  const selectSwitchTargetSource = (sourceValue: string) => {
    setSwitchTargetSourceValue(sourceValue);
    setForm((prev) => {
      if (prev.mode !== 'switch_group') return prev;
      return {
        ...prev,
        sourceRouteIds: [],
        activeSourceRouteId: null,
        activeSourceSiteId: null,
      };
    });
  };

  const selectSwitchTargetModel = (targetValue: string) => {
    const target = selectedSwitchTargetSourceTargets.find((item) => item.value === targetValue) || null;
    if (!target) return;
    const targetRoute = target.route;
    const currentSourceTargets = getRoutesForSwitchTargetSource(switchTargetSourceOptions, selectedSwitchTargetSourceValue);
    const sourceOption = currentSourceTargets.some((item) => item.value === targetValue)
      ? null
      : getSwitchTargetSourceOptionForRoute(switchTargetSourceOptions, targetRoute);
    if (sourceOption && !selectedSwitchTargetSourceValue) setSwitchTargetSourceValue(sourceOption.value);
    setForm((prev) => {
      if (prev.mode !== 'switch_group') return prev;
      return {
        ...prev,
        sourceRouteIds: [targetRoute.id],
        activeSourceRouteId: targetRoute.id,
        activeSourceSiteId: target.siteId,
      };
    });
  };

  const updateHeaderField = (index: number, patch: Partial<CustomHeaderField>) => {
    setForm((prev) => ({
      ...prev,
      customHeaders: prev.customHeaders.map((field, fieldIndex) => (
        fieldIndex === index ? { ...field, ...patch } : field
      )),
    }));
  };

  const addHeaderField = () => {
    setForm((prev) => ({
      ...prev,
      customHeaders: [...prev.customHeaders, emptyCustomHeaderField()],
    }));
  };

  const removeHeaderField = (index: number) => {
    setForm((prev) => {
      const next = prev.customHeaders.filter((_, fieldIndex) => fieldIndex !== index);
      return {
        ...prev,
        customHeaders: next.length > 0 ? next : [emptyCustomHeaderField()],
      };
    });
  };

  const saveGroup = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('请填写下游模型名');
      return;
    }

    const activeSourceRouteId = form.mode === 'switch_group'
      ? (form.activeSourceRouteId ?? form.sourceRouteIds[0] ?? null)
      : null;
    const sourceRouteIds = form.mode === 'switch_group'
      ? (activeSourceRouteId ? [activeSourceRouteId] : [])
      : (form.sourceRouteIds.length > 0 ? form.sourceRouteIds : autoMatchedIds);
    if (sourceRouteIds.length === 0) {
      toast.error(form.mode === 'switch_group' ? '请选择指向目标' : '请至少添加一个来源模型');
      return;
    }
    if (form.mode === 'switch_group' && !activeSourceRouteId) {
      toast.error('请选择当前指向的入口目标');
      return;
    }
    const activeSourceSiteId = form.mode === 'switch_group'
      ? (form.activeSourceSiteId ?? activeSwitchTarget?.siteId ?? null)
      : null;

    const serializedHeaders = form.mode === 'switch_group'
      ? { valid: true, customHeaders: null as string | null, error: null as string | null }
      : serializeCustomHeaders(form.customHeaders);
    if (!serializedHeaders.valid) {
      toast.error(serializedHeaders.error || 'Header 配置不正确');
      return;
    }

    if (editingRouteId) {
      const targetName = editingRoute ? resolveRouteTitle(editingRoute) : name;
      const confirmed = globalThis.confirm(
        `确认保存对模型分组 ${targetName} 的更改吗？保存后会立即影响下游请求选择的供应商。`,
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const payload = form.mode === 'switch_group' ? {
        routeMode: form.mode,
        displayName: name,
        sourceRouteIds,
        activeSourceRouteId,
        activeSourceSiteId,
        customHeaderTemplateId: form.customHeaderTemplateId,
        enabled: form.enabled,
      } : {
        routeMode: form.mode,
        displayName: name,
        sourceRouteIds,
        activeSourceRouteId,
        routingStrategy: form.routingStrategy,
        customHeaderTemplateId: form.customHeaderTemplateId,
        customHeaders: serializedHeaders.customHeaders || null,
        enabled: form.enabled,
      };
      if (editingRouteId) {
        await api.updateRoute(editingRouteId, payload);
        toast.success('模型分组已更新');
      } else {
        await api.addRoute(payload);
        toast.success('模型分组已创建');
      }
      await load();
      setEditingRouteId(null);
      setForm(EMPTY_FORM);
      setSourceSearch('');
      setSwitchTargetSourceValue('');
      setEditorOpen(false);
    } catch (error: any) {
      toast.error(error?.message || '保存模型分组失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (route: RouteSummaryRow) => {
    if (!globalThis.confirm(`确认删除模型分组 ${resolveRouteTitle(route)}？`)) return;
    try {
      await api.deleteRoute(route.id);
      toast.success('模型分组已删除');
      if (editingRouteId === route.id) {
        setEditingRouteId(null);
        setForm(EMPTY_FORM);
        setEditorOpen(false);
      }
      setExpandedGroupIds((prev) => prev.filter((routeId) => routeId !== route.id));
      await load();
    } catch (error: any) {
      toast.error(error?.message || '删除模型分组失败');
    }
  };

  const toggleGroupEnabled = async (route: RouteSummaryRow) => {
    const enabled = !route.enabled;
    setRoutes((prev) => prev.map((item) => (
      item.id === route.id ? { ...item, enabled } : item
    )));
    try {
      await api.updateRoute(route.id, { enabled });
      toast.success(enabled ? '模型分组已启用' : '模型分组已停用');
    } catch (error: any) {
      setRoutes((prev) => prev.map((item) => (
        item.id === route.id ? { ...item, enabled: route.enabled } : item
      )));
      toast.error(error?.message || '切换分组状态失败');
    }
  };

  const updateSwitchGroupActiveTarget = async (route: RouteSummaryRow, nextTarget: SwitchTargetOption) => {
    if (!isSwitchGroupRoute(route)) return;
    const nextRouteId = nextTarget.route.id;
    if (!Number.isFinite(nextRouteId) || nextRouteId <= 0) return;
    const nextTargetRoute = routeById.get(nextRouteId) || null;
    if (!nextTargetRoute) {
      toast.error('当前目标不存在');
      return;
    }
    const previousActiveSourceRouteId = typeof route.activeSourceRouteId === 'number'
      ? route.activeSourceRouteId
      : getSwitchGroupActiveSourceRouteId(route.modelMapping);
    const previousActiveSourceSiteId = route.activeSourceSiteId ?? null;
    if (previousActiveSourceRouteId === nextRouteId && previousActiveSourceSiteId === nextTarget.siteId) return;
    const previousSourceRouteIds = route.sourceRouteIds || [];
    const nextSourceRouteIds = [nextRouteId];

    setQuickSwitchingRouteId(route.id);
    setRoutes((prev) => prev.map((item) => (
      item.id === route.id
        ? { ...item, sourceRouteIds: nextSourceRouteIds, activeSourceRouteId: nextRouteId, activeSourceSiteId: nextTarget.siteId }
        : item
    )));
    try {
      await api.updateRoute(route.id, {
        sourceRouteIds: nextSourceRouteIds,
        activeSourceRouteId: nextRouteId,
        activeSourceSiteId: nextTarget.siteId,
      });
      toast.success('当前指向已更新');
      await load();
    } catch (error: any) {
      setRoutes((prev) => prev.map((item) => (
        item.id === route.id
          ? {
            ...item,
            sourceRouteIds: previousSourceRouteIds,
            activeSourceRouteId: previousActiveSourceRouteId ?? null,
            activeSourceSiteId: previousActiveSourceSiteId,
          }
          : item
      )));
      toast.error(error?.message || '更新当前指向失败');
    } finally {
      setQuickSwitchingRouteId(null);
    }
  };

  const updateSwitchGroupHeaderTemplate = async (route: RouteSummaryRow, nextTemplateId: number | null) => {
    if (!isSwitchGroupRoute(route)) return;
    const normalizedTemplateId = nextTemplateId && Number.isFinite(nextTemplateId) && nextTemplateId > 0
      ? nextTemplateId
      : null;
    const previousTemplateId = route.customHeaderTemplateId ?? null;
    if (previousTemplateId === normalizedTemplateId) return;

    setQuickSwitchingRouteId(route.id);
    setRoutes((prev) => prev.map((item) => (
      item.id === route.id ? { ...item, customHeaderTemplateId: normalizedTemplateId } : item
    )));
    try {
      await api.updateRoute(route.id, {
        customHeaderTemplateId: normalizedTemplateId,
      });
      toast.success(normalizedTemplateId ? 'Header 模板已更新' : 'Header 模板已取消');
      await load();
    } catch (error: any) {
      setRoutes((prev) => prev.map((item) => (
        item.id === route.id ? { ...item, customHeaderTemplateId: previousTemplateId } : item
      )));
      toast.error(error?.message || '更新 Header 模板失败');
    } finally {
      setQuickSwitchingRouteId(null);
    }
  };

  const rebuildSourceModels = async () => {
    try {
      setRebuilding(true);
      const response = await api.rebuildRoutes(true);
      toast.info(response?.message || '已开始同步供应商模型');
      await load();
    } catch (error: any) {
      toast.error(error?.message || '同步供应商模型失败');
    } finally {
      setRebuilding(false);
    }
  };

  const canSave = !!form.name.trim()
    && (
      form.mode === 'switch_group'
        ? !!form.activeSourceRouteId
        : (form.sourceRouteIds.length > 0 || autoMatchedIds.length > 0)
    )
    && !saving;
  const allVisibleSourcesSelected = visibleSourceRoutes.length > 0
    && visibleSourceRoutes.every((route) => selectedSourceIdSet.has(route.id));
  const renderSourceRow = (route: RouteSummaryRow) => {
    const active = form.mode === 'switch_group' && form.activeSourceRouteId === route.id;
    const checked = form.mode === 'switch_group' ? active : selectedSourceIdSet.has(route.id);
    const autoMatched = autoMatchedIds.includes(route.id);
    return (
      <label key={route.id} className={`model-group-source-row ${checked ? 'is-selected' : ''}`.trim()}>
        <input
          type={form.mode === 'switch_group' ? 'radio' : 'checkbox'}
          name={form.mode === 'switch_group' ? 'switch-group-target' : undefined}
          checked={checked}
          onChange={() => toggleSourceRoute(route.id)}
        />
        <span className="model-group-source-icon">
          <ModelGlyph model={route.modelPattern} size={18} />
        </span>
        <span className="model-group-source-copy">
          <span className="model-group-source-name">{getSourceTargetLabel(route)}</span>
          <span className="model-group-source-meta">
            {getSourceTargetTypeLabel(route)}
            <span aria-hidden="true"> / </span>
            {formatCount(route.enabledChannelCount, '可用通道')}
            {route.siteNames.length > 0 ? ` / ${route.siteNames.slice(0, 3).join('、')}` : ''}
          </span>
        </span>
        {active && <span className="model-group-active-badge">当前</span>}
        {form.mode !== 'switch_group' && autoMatched && <span className="model-group-auto-badge">匹配</span>}
      </label>
    );
  };
  const renderGroupCard = (route: RouteSummaryRow) => {
    const title = resolveRouteTitle(route);
    const brand = resolveRouteBrand(route);
    const memberRoutes = (route.sourceRouteIds || [])
      .map((routeId) => routeById.get(routeId))
      .filter((item): item is RouteSummaryRow => !!item);
    const switchGroup = isSwitchGroupRoute(route);
    const quickSwitchGroupTargets = switchGroup ? getSwitchGroupTargetRoutes(groupRoutes, route.id) : [];
    const quickSwitchSourceOptions = switchGroup
      ? buildSwitchTargetSourceOptions(quickSwitchGroupTargets, switchModelTargetRoutes)
      : [];
    const activeSourceRouteId = switchGroup
      ? (typeof route.activeSourceRouteId === 'number'
        ? route.activeSourceRouteId
        : getSwitchGroupActiveSourceRouteId(route.modelMapping))
      : null;
    const activeMember = activeSourceRouteId ? routeById.get(activeSourceRouteId) || null : null;
    const activeQuickSwitchSourceOption = getSwitchTargetSourceOptionForRoute(
      quickSwitchSourceOptions,
      activeMember,
      route.activeSourceSiteId ?? null,
    );
    const quickSwitchSourceValue = quickSwitchSourceValueByRouteId[route.id]
      || activeQuickSwitchSourceOption?.value
      || '';
    const quickSwitchTargets = getRoutesForSwitchTargetSource(quickSwitchSourceOptions, quickSwitchSourceValue);
    const allQuickSwitchTargets = getSwitchTargetsFromSources(quickSwitchSourceOptions);
    const activeQuickSwitchTarget = getSwitchTargetOptionForRouteAndSite(
      quickSwitchTargets.length > 0 ? quickSwitchTargets : allQuickSwitchTargets,
      activeSourceRouteId,
      route.activeSourceSiteId ?? null,
    );
    const selected = route.id === editingRouteId;
    const expanded = expandedGroupIdSet.has(route.id);
    const customHeaderCount = countSerializedHeaders(route.customHeaders);
    const hasHeaderConfig = !!route.customHeaderTemplateId || customHeaderCount > 0;
    return (
      <article
        key={route.id}
        className={`model-group-card ${selected ? 'is-selected' : ''} ${expanded ? 'is-expanded' : ''} ${route.enabled ? '' : 'is-disabled'}`.trim()}
        onClick={(event) => handleGroupCardClick(route.id, event)}
      >
        <button
          type="button"
          className="model-group-card-main"
          onClick={() => toggleGroupExpanded(route.id)}
          aria-expanded={expanded}
          aria-controls={`model-group-detail-${route.id}`}
        >
          <span className="model-group-avatar">
            <BrandGlyph brand={brand} model={title} size={24} fallbackText={title} />
          </span>
          <span className="model-group-card-copy">
            <span className="model-group-card-title">{title}</span>
            <span className="model-group-card-meta">
              <span className={`model-group-type-badge ${switchGroup ? 'is-switch' : ''}`.trim()}>
                {getGroupModeLabel(route)}
              </span>
              <span aria-hidden="true">/</span>
              {switchGroup ? '直接切换' : getRouteRoutingStrategyLabel(route.routingStrategy)}
              <span aria-hidden="true">/</span>
              {formatCount(memberRoutes.length, switchGroup ? '目标' : '成员')}
              <span aria-hidden="true">/</span>
              {formatCount(route.enabledChannelCount, '可用通道')}
              {switchGroup && activeMember && (
                <>
                  <span aria-hidden="true">/</span>
                  指向 {activeQuickSwitchTarget ? getSwitchTargetOptionLabel(activeQuickSwitchTarget) : getSourceTargetLabel(activeMember)}
                </>
              )}
              {hasHeaderConfig && (
                <>
                  <span aria-hidden="true">/</span>
                  Header
                </>
              )}
            </span>
          </span>
          <span className="model-group-expand-indicator" aria-hidden="true" />
        </button>
        <div className="model-group-card-members">
          {switchGroup ? (
            activeMember ? (
              <span className="model-group-member-chip is-active">
                <ModelGlyph model={activeMember.modelPattern} size={14} />
                当前：{activeQuickSwitchTarget ? getSwitchTargetOptionLabel(activeQuickSwitchTarget) : getSourceTargetLabel(activeMember)}
              </span>
            ) : (
              <span className="model-group-member-chip is-muted">未选择当前目标</span>
            )
          ) : (
            <>
              {memberRoutes.slice(0, 4).map((member) => (
                <span
                  key={member.id}
                  className={`model-group-member-chip ${member.id === activeSourceRouteId ? 'is-active' : ''}`.trim()}
                >
                  <ModelGlyph model={member.modelPattern} size={14} />
                  {getSourceTargetLabel(member)}
                </span>
              ))}
              {memberRoutes.length > 4 && (
                <span className="model-group-member-chip is-muted">+{memberRoutes.length - 4}</span>
              )}
            </>
          )}
        </div>
        {expanded && (
          <div className={`model-group-detail ${switchGroup ? 'is-switch-quick' : ''}`.trim()} id={`model-group-detail-${route.id}`}>
            {switchGroup ? (
              <>
                <div className="model-group-detail-header">
                  <span>当前使用</span>
                  <span>{formatCount(switchModelTargetRoutes.length, '可选模型')}</span>
                </div>
                {activeMember ? (
                  <div className="model-group-current-target">
                    <span className="model-group-source-icon">
                      <ModelGlyph model={activeMember.modelPattern} size={18} />
                    </span>
                    <span className="model-group-detail-copy">
                      <span className="model-group-detail-model">
                        {activeQuickSwitchTarget ? getSwitchTargetOptionLabel(activeQuickSwitchTarget) : getSourceTargetLabel(activeMember)}
                      </span>
                      <span className="model-group-detail-meta">
                        {isPublicGroupRoute(activeMember)
                          ? `${getSourceTargetTypeLabel(activeMember)} / 请重新选择精确模型`
                          : activeQuickSwitchTarget
                            ? getSwitchTargetOptionDescription(activeQuickSwitchTarget)
                            : getSwitchTargetModelDescription(activeMember)}
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="model-group-detail-empty">当前没有可用目标</div>
                )}
                <div className="model-group-quick-switch">
                  <FieldLabel>快速切换</FieldLabel>
                  <div className="model-group-field">
                    <FieldLabel>Header 模板</FieldLabel>
                    <ModernSelect
                      data-testid={`model-group-quick-switch-header-${route.id}`}
                      value={route.customHeaderTemplateId ? String(route.customHeaderTemplateId) : ''}
                      onChange={(value) => void updateSwitchGroupHeaderTemplate(route, value ? Number(value) : null)}
                      options={switchHeaderTemplateOptions}
                      placeholder="选择 Header 模板"
                      disabled={quickSwitchingRouteId === route.id}
                      searchable
                      searchPlaceholder="搜索模板"
                      emptyLabel="暂无 Header 模板"
                      size="sm"
                    />
                  </div>
                  <div className="model-group-switch-target-grid">
                    <ModernSelect
                      data-testid={`model-group-quick-switch-source-${route.id}`}
                      value={quickSwitchSourceValue}
                      onChange={(value) => {
                        setQuickSwitchSourceValueByRouteId((prev) => ({ ...prev, [route.id]: value }));
                      }}
                      options={quickSwitchSourceOptions.map((source) => ({
                        value: source.value,
                        label: source.label,
                        description: source.description,
                        iconNode: getSwitchSourceKindPill(source.kind),
                      }))}
                      placeholder="选择分组或供应商"
                      disabled={quickSwitchingRouteId === route.id || quickSwitchSourceOptions.length === 0}
                      searchable
                      searchPlaceholder="搜索分组或供应商"
                      emptyLabel="暂无可选来源"
                      size="sm"
                    />
                    <ModernSelect
                      data-testid={`model-group-quick-switch-${route.id}`}
                      value={activeQuickSwitchTarget?.value || ''}
                      onChange={(value) => {
                        const target = quickSwitchTargets.find((item) => item.value === value);
                        if (target) void updateSwitchGroupActiveTarget(route, target);
                      }}
                      options={quickSwitchTargets.map((target) => ({
                        value: target.value,
                        label: getSwitchTargetOptionLabel(target),
                        description: getSwitchTargetOptionDescription(target),
                        iconNode: getSwitchTargetModelTypePill(),
                      }))}
                      placeholder="选择模型"
                      disabled={quickSwitchingRouteId === route.id || !quickSwitchSourceValue}
                      searchable
                      searchPlaceholder="搜索模型"
                      emptyLabel={quickSwitchSourceValue ? '暂无可选模型' : '请先选择分组或供应商'}
                      size="sm"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="model-group-detail-header">
                  <span>成员明细</span>
                  <span>{formatCount(memberRoutes.length, '模型')}</span>
                </div>
                <div className="model-group-detail-list">
                  {memberRoutes.length === 0 ? (
                    <div className="model-group-detail-empty">暂无成员模型</div>
                  ) : memberRoutes.map((member) => {
                    const suppliers = getSupplierStatuses(member);
                    return (
                      <div key={member.id} className="model-group-detail-row">
                        <span className="model-group-source-icon">
                          <ModelGlyph model={member.modelPattern} size={18} />
                        </span>
                        <span className="model-group-detail-copy">
                          <span className="model-group-detail-model">{getSourceTargetLabel(member)}</span>
                          <span className="model-group-detail-meta">
                            {getSourceTargetTypeLabel(member)}
                            <span aria-hidden="true"> / </span>
                            {formatCount(member.enabledChannelCount, '可用通道')}
                          </span>
                        </span>
                        <span className="model-group-detail-suppliers" aria-label="供应商">
                          {suppliers.length === 0 ? (
                            <span className="model-group-supplier-chip is-muted">未绑定供应商</span>
                          ) : suppliers.map((supplier) => (
                            <span
                              key={supplier.key}
                              className={`model-group-supplier-chip ${supplier.status === 'disabled' ? 'is-disabled' : ''}`.trim()}
                              title={supplier.status === 'disabled' ? `${supplier.name} 已禁用` : supplier.name}
                            >
                              {supplier.name}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        <div className="model-group-card-actions">
          <button
            type="button"
            className={`route-enable-toggle model-group-status-toggle ${route.enabled ? 'is-enabled' : 'is-disabled'}`}
            onClick={() => toggleGroupEnabled(route)}
          >
            {route.enabled ? '启用' : '停用'}
          </button>
          <button type="button" className="btn-link" onClick={() => startEdit(route)}>编辑</button>
          <button type="button" className="btn-link btn-link-danger" onClick={() => deleteGroup(route)}>删除</button>
        </div>
      </article>
    );
  };

  return (
    <div className="model-groups-page">
      <div className="page-header model-groups-header">
        <div>
          <h1 className="page-title">模型分组</h1>
          <p className="page-subtitle">下游只看到分组模型名，请求时按策略选择成员供应商。</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={rebuildSourceModels}
            disabled={rebuilding}
          >
            {rebuilding ? '同步中...' : '同步供应商模型'}
          </button>
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            新建分组
          </button>
        </div>
      </div>

      <section className="model-groups-overview" aria-label="模型分组概览">
        <div className="model-groups-metric">
          <span className="model-groups-metric-label">对外模型</span>
          <strong>{formatCount(groupRoutes.length, '个')}</strong>
        </div>
        <div className="model-groups-metric">
          <span className="model-groups-metric-label">启用中</span>
          <strong>{formatCount(totalEnabledGroups, '个')}</strong>
        </div>
        <div className="model-groups-metric">
          <span className="model-groups-metric-label">来源模型</span>
          <strong>{formatCount(totalMemberRoutes, '个')}</strong>
        </div>
        <div className="model-groups-search">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索分组或来源模型"
          />
        </div>
      </section>

      <div className="model-groups-layout">
        <section className="model-groups-list" aria-label="模型分组列表">
          {loading ? (
            <div className="empty-state">
              <div className="empty-state-title">正在加载模型分组</div>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="model-groups-empty">
              <div className="empty-state-icon">M</div>
              <div className="empty-state-title">还没有模型分组</div>
              <div className="empty-state-desc">先同步供应商模型，再把同类模型放进一个对外名称。</div>
              <button type="button" className="btn btn-primary" onClick={startCreate}>新建分组</button>
            </div>
          ) : showSeparatedGroupSections ? (
            <div className="model-groups-list-sections">
              <section className="model-groups-list-section is-switch" aria-label="切换分组列表">
                <div className="model-groups-list-section-header">
                  <div>
                    <span className="model-groups-list-section-title">切换分组</span>
                    <span className="model-groups-list-section-count">
                      {filteredSwitchGroups.length} / {switchGroupCount}
                    </span>
                  </div>
                  <span className="model-group-type-badge is-switch">后台指向</span>
                </div>
                {filteredSwitchGroups.length === 0 ? (
                  <div className="model-groups-list-section-empty">没有匹配的切换分组</div>
                ) : filteredSwitchGroups.map(renderGroupCard)}
              </section>
              <section className="model-groups-list-section" aria-label="普通分组列表">
                <div className="model-groups-list-section-header">
                  <div>
                    <span className="model-groups-list-section-title">普通分组</span>
                    <span className="model-groups-list-section-count">
                      {filteredNormalGroups.length} / {normalGroupCount}
                    </span>
                  </div>
                  <span className="model-group-type-badge">策略分发</span>
                </div>
                {filteredNormalGroups.length === 0 ? (
                  <div className="model-groups-list-section-empty">没有匹配的普通分组</div>
                ) : filteredNormalGroups.map(renderGroupCard)}
              </section>
            </div>
          ) : (
            filteredGroups.map(renderGroupCard)
          )}
        </section>
      </div>

      {editorOpen && (
        <BodyPortal>
        <div
          className="model-group-editor-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
        <aside
          className="model-group-editor model-group-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-group-editor-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="model-group-editor-header">
            <div>
              <h2 id="model-group-editor-title">{editingRoute ? '编辑分组' : '新建分组'}</h2>
              <p>{editingRoute ? resolveRouteTitle(editingRoute) : '为下游创建一个稳定模型名'}</p>
            </div>
            <div className="model-group-editor-header-actions">
              {editingRoute && (
                <button type="button" className="btn-link" onClick={startCreate}>新建</button>
              )}
              <button type="button" className="btn-link" onClick={closeEditor}>关闭</button>
            </div>
          </div>

          <div className="model-group-form">
            <label className="model-group-field">
              <FieldLabel>下游模型名</FieldLabel>
              <input
                value={form.name}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name: value,
                    autoQuery: prev.autoQuery || value,
                  }));
                }}
                placeholder="例如 gpt-5.5"
              />
            </label>

            <div className="model-group-field">
              <FieldLabel>分组类型</FieldLabel>
              <div className="model-group-mode-control" role="group" aria-label="分组类型">
                <button
                  type="button"
                  className={form.mode === 'explicit_group' ? 'is-active' : ''}
                  onClick={() => updateGroupMode('explicit_group')}
                >
                  普通分组
                </button>
                <button
                  type="button"
                  className={form.mode === 'switch_group' ? 'is-active' : ''}
                  onClick={() => updateGroupMode('switch_group')}
                >
                  切换分组
                </button>
              </div>
              <div className="model-group-field-hint">
                {form.mode === 'switch_group'
                  ? '下游固定请求此模型名，后台手动切换当前入口目标。'
                  : '下游请求此模型名时，按策略在成员供应商模型中选择。'}
              </div>
            </div>

            {form.mode !== 'switch_group' && (
              <>
                <div className="model-group-field">
                  <FieldLabel>选择策略</FieldLabel>
                  <ModernSelect
                    value={form.routingStrategy}
                    onChange={(value) => setForm((prev) => ({
                      ...prev,
                      routingStrategy: normalizeRouteRoutingStrategyValue(value as RouteRoutingStrategy),
                    }))}
                    options={STRATEGY_OPTIONS}
                  />
                  <div className="model-group-field-hint">
                    {getRouteRoutingStrategyDescription(form.routingStrategy)}
                  </div>
                </div>

                <div className="model-group-field">
                  <FieldLabel>Header 模板</FieldLabel>
                  <ModernSelect
                    value={form.customHeaderTemplateId ? String(form.customHeaderTemplateId) : ''}
                    onChange={(value) => setForm((prev) => ({
                      ...prev,
                      customHeaderTemplateId: value ? Number(value) : null,
                    }))}
                    options={headerTemplateOptions}
                    searchable
                    searchPlaceholder="搜索模板"
                    emptyLabel="暂无 Header 模板"
                  />
                  <div className="model-group-field-hint">
                    {selectedHeaderTemplate
                      ? `${selectedHeaderTemplate.name} / ${countSerializedHeaders(selectedHeaderTemplate.headers)} 个 Header`
                      : '未选择模板'}
                  </div>
                </div>

                <div className="model-group-field">
                  <div className="model-group-header-toolbar">
                    <FieldLabel>分组自定义 Header</FieldLabel>
                    <button type="button" className="btn-link" onClick={addHeaderField}>添加</button>
                  </div>
                  <div className="model-group-header-list">
                    {form.customHeaders.map((field, index) => (
                      <div key={index} className="model-group-header-row">
                        <input
                          value={field.key}
                          onChange={(event) => updateHeaderField(index, { key: event.target.value })}
                          placeholder="Header 名称"
                        />
                        <input
                          value={field.value}
                          onChange={(event) => updateHeaderField(index, { value: event.target.value })}
                          placeholder="Header 值"
                        />
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          onClick={() => removeHeaderField(index)}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="model-group-field-hint">
                    当前分组配置 {countHeaderFields(form.customHeaders)} 个 Header。
                  </div>
                </div>

                <label className="model-group-field">
                  <FieldLabel>自动匹配关键词</FieldLabel>
                  <div className="model-group-inline-control">
                    <input
                      value={form.autoQuery}
                      onChange={(event) => setForm((prev) => ({ ...prev, autoQuery: event.target.value }))}
                      placeholder="默认使用下游模型名"
                    />
                    <button type="button" className="btn btn-soft-primary" onClick={applyAutoMatch}>
                      自动匹配
                    </button>
                  </div>
                  <div className="model-group-field-hint">
                    当前可匹配 {autoMatchedIds.length} 个供应商模型。
                  </div>
                </label>
              </>
            )}

            {form.mode === 'switch_group' && (
              <div className="model-group-field">
                <FieldLabel>Header 模板</FieldLabel>
                <ModernSelect
                  data-testid="model-group-editor-switch-header-template"
                  value={form.customHeaderTemplateId ? String(form.customHeaderTemplateId) : ''}
                  onChange={(value) => setForm((prev) => ({
                    ...prev,
                    customHeaderTemplateId: value ? Number(value) : null,
                  }))}
                  options={switchHeaderTemplateOptions}
                  searchable
                  searchPlaceholder="搜索模板"
                  emptyLabel="暂无 Header 模板"
                />
                <div className="model-group-field-hint">
                  {selectedHeaderTemplate
                    ? `请求时使用 ${selectedHeaderTemplate.name} 的 Header。`
                    : '不选择模板时，沿用当前指向目标的 Header 处理。'}
                </div>
              </div>
            )}

            <div className="model-group-source-toolbar">
              <div className="model-group-source-heading">
                <div className="model-group-source-heading-copy">
                  <FieldLabel>{form.mode === 'switch_group' ? '指向目标' : '成员模型'}</FieldLabel>
                  <span>
                    {form.mode === 'switch_group'
                      ? (activeSwitchTarget
                        ? getSwitchTargetOptionLabel(activeSwitchTarget)
                        : (activeTargetRoute ? getSourceTargetLabel(activeTargetRoute) : `0 / ${switchModelTargetRoutes.length}`))
                      : `${selectedSourceRoutes.length} / ${sourceCandidateRoutes.length}`}
                  </span>
                </div>
                {form.mode !== 'switch_group' && (
                  <div className="model-group-source-actions">
                    <button
                      type="button"
                      className="model-group-source-action is-select"
                      onClick={() => selectSourceRoutes(visibleSourceRoutes.map((route) => route.id))}
                      disabled={visibleSourceRoutes.length === 0 || allVisibleSourcesSelected}
                    >
                      <SourceToolIcon type="select" />
                      <span>{allVisibleSourcesSelected ? '已全选' : '全选'}</span>
                    </button>
                    <button
                      type="button"
                      className="model-group-source-action is-clear"
                      onClick={clearSourceRoutes}
                      disabled={form.sourceRouteIds.length === 0}
                    >
                      <SourceToolIcon type="clear" />
                      <span>清空</span>
                    </button>
                  </div>
                )}
              </div>
              {form.mode !== 'switch_group' && (
                <div className="model-group-source-tools">
                  <input
                    type="search"
                    value={sourceSearch}
                    onChange={(event) => setSourceSearch(event.target.value)}
                    placeholder="搜索来源模型"
                  />
                </div>
              )}
            </div>

            {form.mode === 'switch_group' ? (
              <div className="model-group-switch-target-grid">
                <div className="model-group-field">
                  <FieldLabel>选择分组或供应商</FieldLabel>
                  <ModernSelect
                    data-testid="model-group-editor-switch-source"
                    value={selectedSwitchTargetSourceValue}
                    onChange={selectSwitchTargetSource}
                    options={switchTargetSourceOptions.map((source) => ({
                      value: source.value,
                      label: source.label,
                      description: source.description,
                      iconNode: getSwitchSourceKindPill(source.kind),
                    }))}
                    placeholder="选择分组或供应商"
                    searchable
                    searchPlaceholder="搜索分组或供应商"
                    emptyLabel="暂无可选分组或供应商"
                  />
                </div>
                <div className="model-group-field">
                  <FieldLabel>选择模型</FieldLabel>
                  <ModernSelect
                    data-testid="model-group-editor-switch-model"
                    value={activeSwitchTarget?.value || ''}
                    onChange={selectSwitchTargetModel}
                    options={selectedSwitchTargetSourceTargets.map((target) => ({
                      value: target.value,
                      label: getSwitchTargetOptionLabel(target),
                      description: getSwitchTargetOptionDescription(target),
                      iconNode: getSwitchTargetModelTypePill(),
                    }))}
                    placeholder="选择模型"
                    searchable
                    searchPlaceholder="搜索模型"
                    emptyLabel={selectedSwitchTargetSourceValue ? '暂无可选模型' : '请先选择分组或供应商'}
                    disabled={!selectedSwitchTargetSourceValue}
                  />
                </div>
              </div>
            ) : (
              <div className="model-group-source-list">
                {filteredSourceRoutes.length === 0 ? (
                <div className="model-group-source-empty">没有可选来源模型</div>
                ) : filteredSourceRoutes.map(renderSourceRow)}
              </div>
            )}

            {form.mode === 'switch_group' && activeTargetRoute && (
              <div className="model-group-field-hint">
                当前下游请求会走 {activeSwitchTarget ? getSwitchTargetOptionLabel(activeSwitchTarget) : getSourceTargetLabel(activeTargetRoute)}。
              </div>
            )}

            <label className="model-group-enabled-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span>启用此分组</span>
            </label>

            <div className="model-group-form-actions">
              <button type="button" className="btn btn-primary" onClick={saveGroup} disabled={!canSave}>
                {saving ? '保存中...' : (editingRoute ? '保存分组' : '创建分组')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeEditor}
              >
                取消
              </button>
            </div>
          </div>
        </aside>
        </div>
        </BodyPortal>
      )}
    </div>
  );
}
