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
  customHeaderTemplateId: number | null;
  customHeaders: CustomHeaderField[];
  enabled: boolean;
};

const EMPTY_FORM: GroupForm = {
  mode: 'explicit_group',
  name: '',
  autoQuery: '',
  routingStrategy: 'stable_first',
  sourceRouteIds: [],
  activeSourceRouteId: null,
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

function getSupplierStatuses(route: RouteSummaryRow): Array<{ key: string; name: string; status: string }> {
  if (Array.isArray(route.siteStatuses) && route.siteStatuses.length > 0) {
    const seen = new Set<string>();
    const suppliers: Array<{ key: string; name: string; status: string }> = [];
    for (const item of route.siteStatuses) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const id = typeof item.id === 'number' && Number.isFinite(item.id) ? Math.trunc(item.id) : null;
      const key = id != null ? `site:${id}` : `name:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suppliers.push({
        key,
        name,
        status: String(item.status || 'active').trim() || 'active',
      });
    }
    return suppliers;
  }

  return getSupplierNames(route).map((name) => ({
    key: `name:${name.toLowerCase()}`,
    name,
    status: 'active',
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

function getSourceTargetTypeShortLabel(route: RouteSummaryRow): string {
  if (isSwitchGroupRoute(route)) return '切换';
  return isPublicGroupRoute(route) ? '分组' : '单模';
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

function getSourceTargetTypePill(route: RouteSummaryRow): ReactNode {
  return (
    <span className={`model-group-target-kind-pill ${isPublicGroupRoute(route) ? 'is-group' : 'is-model'}`.trim()}>
      {getSourceTargetTypeShortLabel(route)}
    </span>
  );
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

function countSelectedSourceTargets(routes: RouteSummaryRow[], selectedRouteIds: Set<number>): number {
  return routes.reduce((total, route) => total + (selectedRouteIds.has(route.id) ? 1 : 0), 0);
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
    () => groupRoutes
      .filter((route) => !isSwitchGroupRoute(route) && route.id !== editingRouteId)
      .sort((left, right) => (
        getSourceTargetLabel(left).localeCompare(getSourceTargetLabel(right), undefined, { sensitivity: 'base' })
      )),
    [editingRouteId, groupRoutes],
  );
  const switchModelTargetRoutes = exactRoutes;
  const switchTargetRoutes = useMemo(
    () => [...switchGroupTargetRoutes, ...switchModelTargetRoutes],
    [switchGroupTargetRoutes, switchModelTargetRoutes],
  );
  const sourceCandidateRoutes = form.mode === 'switch_group' ? switchTargetRoutes : exactRoutes;

  const filteredSourceRoutes = useMemo(
    () => filterAndSortSourceTargets(sourceCandidateRoutes, sourceSearch, selectedSourceIdSet),
    [selectedSourceIdSet, sourceCandidateRoutes, sourceSearch],
  );
  const filteredSwitchGroupTargetRoutes = useMemo(
    () => filterAndSortSourceTargets(switchGroupTargetRoutes, sourceSearch, selectedSourceIdSet),
    [selectedSourceIdSet, sourceSearch, switchGroupTargetRoutes],
  );
  const filteredSwitchModelTargetRoutes = useMemo(
    () => filterAndSortSourceTargets(switchModelTargetRoutes, sourceSearch, selectedSourceIdSet),
    [selectedSourceIdSet, sourceSearch, switchModelTargetRoutes],
  );
  const visibleSourceRoutes = useMemo(
    () => (form.mode === 'switch_group'
      ? [...filteredSwitchGroupTargetRoutes, ...filteredSwitchModelTargetRoutes]
      : filteredSourceRoutes),
    [filteredSourceRoutes, filteredSwitchGroupTargetRoutes, filteredSwitchModelTargetRoutes, form.mode],
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
  const selectedSwitchTargetRoutes = useMemo(
    () => sortSwitchTargetsByKind(selectedSourceRoutes),
    [selectedSourceRoutes],
  );
  const activeTargetRoute = form.activeSourceRouteId ? routeById.get(form.activeSourceRouteId) || null : null;

  const totalMemberRoutes = groupRoutes.reduce((total, route) => total + (route.sourceRouteIds?.length || 0), 0);
  const totalEnabledGroups = groupRoutes.filter((route) => route.enabled).length;

  const startCreate = () => {
    setEditingRouteId(null);
    setForm(EMPTY_FORM);
    setSourceSearch('');
    setEditorOpen(true);
  };

  const startEdit = (route: RouteSummaryRow) => {
    setEditingRouteId(route.id);
    setForm(buildGroupForm(route));
    setSourceSearch('');
    setExpandedGroupIds((prev) => (prev.includes(route.id) ? prev : [...prev, route.id]));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditingRouteId(null);
    setForm(EMPTY_FORM);
    setSourceSearch('');
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
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [editorOpen, saving]);

  const updateGroupMode = (mode: GroupForm['mode']) => {
    setForm((prev) => {
      if (prev.mode === mode) return prev;
      const sourceRouteIds = mode === 'explicit_group'
        ? prev.sourceRouteIds.filter((routeId) => exactRouteIdSet.has(routeId))
        : prev.sourceRouteIds;
      const activeSourceRouteId = mode === 'switch_group'
        ? (prev.activeSourceRouteId && sourceRouteIds.includes(prev.activeSourceRouteId)
          ? prev.activeSourceRouteId
          : (sourceRouteIds[0] ?? null))
        : null;
      return {
        ...prev,
        mode,
        sourceRouteIds,
        activeSourceRouteId,
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
      sourceRouteIds: autoMatchedIds,
      activeSourceRouteId: prev.mode === 'switch_group' ? (autoMatchedIds[0] ?? null) : prev.activeSourceRouteId,
    }));
    toast.success(`已匹配 ${autoMatchedIds.length} 个来源模型`);
  };

  const toggleSourceRoute = (routeId: number) => {
    setForm((prev) => {
      const next = new Set(prev.sourceRouteIds);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      const sourceRouteIds = Array.from(next);
      const activeSourceRouteId = prev.mode === 'switch_group'
        ? (prev.activeSourceRouteId && sourceRouteIds.includes(prev.activeSourceRouteId)
          ? prev.activeSourceRouteId
          : (sourceRouteIds[0] ?? null))
        : prev.activeSourceRouteId;
      return {
        ...prev,
        sourceRouteIds,
        activeSourceRouteId,
      };
    });
  };

  const selectSourceRoutes = (routeIds: number[]) => {
    const normalizedRouteIds = Array.from(new Set(
      routeIds.filter((routeId) => Number.isFinite(routeId) && routeId > 0),
    ));
    if (normalizedRouteIds.length === 0) return;
    setForm((prev) => {
      const next = new Set(prev.sourceRouteIds);
      for (const routeId of normalizedRouteIds) next.add(routeId);
      const sourceRouteIds = Array.from(next);
      const activeSourceRouteId = prev.mode === 'switch_group'
        ? (prev.activeSourceRouteId && sourceRouteIds.includes(prev.activeSourceRouteId)
          ? prev.activeSourceRouteId
          : (normalizedRouteIds[0] ?? sourceRouteIds[0] ?? null))
        : prev.activeSourceRouteId;
      return {
        ...prev,
        sourceRouteIds,
        activeSourceRouteId,
      };
    });
  };

  const clearSourceRoutes = () => {
    setForm((prev) => ({
      ...prev,
      sourceRouteIds: [],
      activeSourceRouteId: prev.mode === 'switch_group' ? null : prev.activeSourceRouteId,
    }));
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

    const sourceRouteIds = form.sourceRouteIds.length > 0
      ? form.sourceRouteIds
      : autoMatchedIds;
    if (sourceRouteIds.length === 0) {
      toast.error(form.mode === 'switch_group' ? '请至少添加一个入口目标' : '请至少添加一个来源模型');
      return;
    }
    const activeSourceRouteId = form.mode === 'switch_group'
      ? (form.activeSourceRouteId && sourceRouteIds.includes(form.activeSourceRouteId)
        ? form.activeSourceRouteId
        : (sourceRouteIds[0] ?? null))
      : null;
    if (form.mode === 'switch_group' && !activeSourceRouteId) {
      toast.error('请选择当前指向的入口目标');
      return;
    }

    const serializedHeaders = serializeCustomHeaders(form.customHeaders);
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
      const payload = {
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

  const updateSwitchGroupActiveTarget = async (route: RouteSummaryRow, nextRouteId: number) => {
    if (!isSwitchGroupRoute(route)) return;
    if (!Number.isFinite(nextRouteId) || nextRouteId <= 0) return;
    const sourceRouteIds = route.sourceRouteIds || [];
    if (!sourceRouteIds.includes(nextRouteId)) {
      toast.error('当前目标不在切换分组候选范围内');
      return;
    }
    const previousActiveSourceRouteId = typeof route.activeSourceRouteId === 'number'
      ? route.activeSourceRouteId
      : getSwitchGroupActiveSourceRouteId(route.modelMapping);
    if (previousActiveSourceRouteId === nextRouteId) return;

    setQuickSwitchingRouteId(route.id);
    setRoutes((prev) => prev.map((item) => (
      item.id === route.id ? { ...item, activeSourceRouteId: nextRouteId } : item
    )));
    try {
      await api.updateRoute(route.id, { activeSourceRouteId: nextRouteId });
      toast.success('当前指向已更新');
      await load();
    } catch (error: any) {
      setRoutes((prev) => prev.map((item) => (
        item.id === route.id ? { ...item, activeSourceRouteId: previousActiveSourceRouteId ?? null } : item
      )));
      toast.error(error?.message || '更新当前指向失败');
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
    && (form.sourceRouteIds.length > 0 || autoMatchedIds.length > 0)
    && (form.mode !== 'switch_group' || !!form.activeSourceRouteId || form.sourceRouteIds.length === 0)
    && !saving;
  const allVisibleSourcesSelected = visibleSourceRoutes.length > 0
    && visibleSourceRoutes.every((route) => selectedSourceIdSet.has(route.id));
  const selectedSwitchGroupTargetCount = countSelectedSourceTargets(switchGroupTargetRoutes, selectedSourceIdSet);
  const selectedSwitchModelTargetCount = countSelectedSourceTargets(switchModelTargetRoutes, selectedSourceIdSet);
  const allVisibleSwitchGroupTargetsSelected = filteredSwitchGroupTargetRoutes.length > 0
    && filteredSwitchGroupTargetRoutes.every((route) => selectedSourceIdSet.has(route.id));
  const allVisibleSwitchModelTargetsSelected = filteredSwitchModelTargetRoutes.length > 0
    && filteredSwitchModelTargetRoutes.every((route) => selectedSourceIdSet.has(route.id));
  const renderSourceRow = (route: RouteSummaryRow) => {
    const checked = selectedSourceIdSet.has(route.id);
    const autoMatched = autoMatchedIds.includes(route.id);
    const active = form.mode === 'switch_group' && form.activeSourceRouteId === route.id;
    return (
      <label key={route.id} className={`model-group-source-row ${checked ? 'is-selected' : ''}`.trim()}>
        <input
          type="checkbox"
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
        {autoMatched && <span className="model-group-auto-badge">匹配</span>}
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
    const quickSwitchTargetRoutes = switchGroup ? sortSwitchTargetsByKind(memberRoutes) : memberRoutes;
    const activeSourceRouteId = switchGroup
      ? (typeof route.activeSourceRouteId === 'number'
        ? route.activeSourceRouteId
        : getSwitchGroupActiveSourceRouteId(route.modelMapping))
      : null;
    const activeMember = activeSourceRouteId ? routeById.get(activeSourceRouteId) || null : null;
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
              {getRouteRoutingStrategyLabel(route.routingStrategy)}
              <span aria-hidden="true">/</span>
              {formatCount(memberRoutes.length, switchGroup ? '目标' : '成员')}
              <span aria-hidden="true">/</span>
              {formatCount(route.enabledChannelCount, '可用通道')}
              {switchGroup && activeMember && (
                <>
                  <span aria-hidden="true">/</span>
                  指向 {getSourceTargetLabel(activeMember)}
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
                当前：{getSourceTargetLabel(activeMember)}
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
                  <span>{formatCount(memberRoutes.length, '候选')}</span>
                </div>
                {activeMember ? (
                  <div className="model-group-current-target">
                    <span className="model-group-source-icon">
                      <ModelGlyph model={activeMember.modelPattern} size={18} />
                    </span>
                    <span className="model-group-detail-copy">
                      <span className="model-group-detail-model">{getSourceTargetLabel(activeMember)}</span>
                      <span className="model-group-detail-meta">
                        {getSourceTargetTypeLabel(activeMember)}
                        <span aria-hidden="true"> / </span>
                        {formatCount(activeMember.enabledChannelCount, '可用通道')}
                      </span>
                    </span>
                    <span className="model-group-detail-suppliers" aria-label="供应商">
                      {getSupplierStatuses(activeMember).length === 0 ? (
                        <span className="model-group-supplier-chip is-muted">未绑定供应商</span>
                      ) : getSupplierStatuses(activeMember).map((supplier) => (
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
                ) : (
                  <div className="model-group-detail-empty">当前没有可用目标</div>
                )}
                <div className="model-group-quick-switch">
                  <FieldLabel>快速切换</FieldLabel>
                  <ModernSelect
                    data-testid={`model-group-quick-switch-${route.id}`}
                    value={activeSourceRouteId ? String(activeSourceRouteId) : ''}
                    onChange={(value) => void updateSwitchGroupActiveTarget(route, Number(value))}
                    options={quickSwitchTargetRoutes.map((member) => ({
                      value: String(member.id),
                      label: getSourceTargetLabel(member),
                      description: getSourceTargetDescription(member),
                      iconNode: getSourceTargetTypePill(member),
                    }))}
                    placeholder="选择新的当前目标"
                    disabled={quickSwitchingRouteId === route.id || memberRoutes.length === 0}
                    searchable
                    searchPlaceholder="搜索候选目标"
                    emptyLabel="暂无候选目标"
                    size="sm"
                  />
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

            <div className="model-group-source-toolbar">
              <div>
                <FieldLabel>{form.mode === 'switch_group' ? '入口目标' : '成员模型'}</FieldLabel>
                <span>{selectedSourceRoutes.length} / {sourceCandidateRoutes.length}</span>
              </div>
              <div className="model-group-source-tools">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => selectSourceRoutes(visibleSourceRoutes.map((route) => route.id))}
                  disabled={visibleSourceRoutes.length === 0 || allVisibleSourcesSelected}
                >
                  {allVisibleSourcesSelected ? '已全选可见' : '全选可见'}
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={clearSourceRoutes}
                  disabled={form.sourceRouteIds.length === 0}
                >
                  清空
                </button>
                <input
                  type="search"
                  value={sourceSearch}
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder={form.mode === 'switch_group' ? '搜索分组或供应商单模型' : '搜索来源模型'}
                />
              </div>
            </div>

            <div className="model-group-source-list">
              {form.mode === 'switch_group' ? (
                <>
                  <section className="model-group-source-section" aria-label="普通分组">
                    <div className="model-group-source-section-header">
                      <div>
                        <span className="model-group-source-section-title">普通分组</span>
                        <span className="model-group-source-section-count">
                          已选 {selectedSwitchGroupTargetCount} / {switchGroupTargetRoutes.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => selectSourceRoutes(filteredSwitchGroupTargetRoutes.map((route) => route.id))}
                        disabled={filteredSwitchGroupTargetRoutes.length === 0 || allVisibleSwitchGroupTargetsSelected}
                      >
                        {allVisibleSwitchGroupTargetsSelected ? '已全选' : '全选'}
                      </button>
                    </div>
                    {filteredSwitchGroupTargetRoutes.length === 0 ? (
                      <div className="model-group-source-empty">没有匹配的普通分组</div>
                    ) : filteredSwitchGroupTargetRoutes.map(renderSourceRow)}
                  </section>
                  <section className="model-group-source-section" aria-label="供应商单模型">
                    <div className="model-group-source-section-header">
                      <div>
                        <span className="model-group-source-section-title">供应商单模型</span>
                        <span className="model-group-source-section-count">
                          已选 {selectedSwitchModelTargetCount} / {switchModelTargetRoutes.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => selectSourceRoutes(filteredSwitchModelTargetRoutes.map((route) => route.id))}
                        disabled={filteredSwitchModelTargetRoutes.length === 0 || allVisibleSwitchModelTargetsSelected}
                      >
                        {allVisibleSwitchModelTargetsSelected ? '已全选' : '全选'}
                      </button>
                    </div>
                    {filteredSwitchModelTargetRoutes.length === 0 ? (
                      <div className="model-group-source-empty">没有匹配的供应商单模型</div>
                    ) : filteredSwitchModelTargetRoutes.map(renderSourceRow)}
                  </section>
                </>
              ) : filteredSourceRoutes.length === 0 ? (
                <div className="model-group-source-empty">没有可选来源模型</div>
              ) : filteredSourceRoutes.map(renderSourceRow)}
            </div>

            {form.mode === 'switch_group' && (
              <div className="model-group-field">
                <FieldLabel>当前指向</FieldLabel>
                <ModernSelect
                  value={form.activeSourceRouteId ? String(form.activeSourceRouteId) : ''}
                  onChange={(value) => setForm((prev) => ({
                    ...prev,
                    activeSourceRouteId: value ? Number(value) : null,
                  }))}
                  options={[
                    { value: '', label: '请选择当前目标', description: '保存后下游请求会转发到此目标' },
                    ...selectedSwitchTargetRoutes.map((route) => ({
                      value: String(route.id),
                      label: getSourceTargetLabel(route),
                      description: `${getSourceTargetTypeLabel(route)} / ${formatCount(route.enabledChannelCount, '可用通道')}`,
                    })),
                  ]}
                  searchable
                  searchPlaceholder="搜索已选目标"
                  emptyLabel="请先选择入口目标"
                />
                <div className="model-group-field-hint">
                  {activeTargetRoute
                    ? `当前下游请求会走 ${getSourceTargetLabel(activeTargetRoute)}。`
                    : '选择一个已勾选目标作为当前承接入口。'}
                </div>
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
