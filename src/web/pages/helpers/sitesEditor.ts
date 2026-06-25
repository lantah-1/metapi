export type SiteApiEndpointField = {
  draftId?: string;
  url: string;
  enabled: boolean;
  cooldownUntil?: string | null;
  lastFailureReason?: string | null;
};

export type SiteForm = {
  name: string;
  url: string;
  externalCheckinUrl: string;
  platform: string;
  proxyUrl: string;
  useSystemProxy: boolean;
  apiEndpoints: SiteApiEndpointField[];
  globalWeight: string;
};

export type SiteEditorState =
  | { mode: 'add' }
  | { mode: 'edit'; editingSiteId: number };

export type SiteSavePayload = {
  name: string;
  url: string;
  externalCheckinUrl: string;
  platform: string;
  initializationPresetId?: string | null;
  proxyUrl: string;
  useSystemProxy: boolean;
  apiEndpoints: Array<{
    url: string;
    enabled: boolean;
    sortOrder: number;
  }>;
  globalWeight: number;
};

type SiteSaveAction =
  | { kind: 'add'; payload: SiteSavePayload }
  | { kind: 'update'; id: number; payload: SiteSavePayload };

export function emptySiteApiEndpoint(): SiteApiEndpointField {
  return {
    url: '',
    enabled: true,
    cooldownUntil: null,
    lastFailureReason: null,
  };
}

export function emptySiteForm(): SiteForm {
  return {
    name: '',
    url: '',
    externalCheckinUrl: '',
    platform: '',
    proxyUrl: '',
    useSystemProxy: false,
    apiEndpoints: [emptySiteApiEndpoint()],
    globalWeight: '1',
  };
}

function ensureSiteApiEndpointRows(rows: SiteApiEndpointField[]): SiteApiEndpointField[] {
  return rows.length > 0 ? rows : [emptySiteApiEndpoint()];
}

function parseApiEndpointsForEditor(raw: unknown): SiteApiEndpointField[] {
  if (!Array.isArray(raw)) {
    return ensureSiteApiEndpointRows([]);
  }

  const rows: SiteApiEndpointField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    rows.push({
      url: typeof row.url === 'string' ? row.url : '',
      enabled: row.enabled !== false,
      cooldownUntil: typeof row.cooldownUntil === 'string' ? row.cooldownUntil : null,
      lastFailureReason: typeof row.lastFailureReason === 'string' ? row.lastFailureReason : null,
    });
  }
  return ensureSiteApiEndpointRows(rows);
}

export function siteFormFromSite(site: Partial<Omit<SiteForm, 'apiEndpoints' | 'globalWeight' | 'externalCheckinUrl' | 'proxyUrl' | 'useSystemProxy'>> & {
  externalCheckinUrl?: string | null;
  proxyUrl?: string | null;
  useSystemProxy?: boolean | null;
  apiEndpoints?: Array<{
    url?: string | null;
    enabled?: boolean | null;
    cooldownUntil?: string | null;
    lastFailureReason?: string | null;
  }> | null;
  globalWeight?: number | string | null;
}): SiteForm {
  const globalWeightRaw = Number(site.globalWeight);
  const globalWeight = Number.isFinite(globalWeightRaw) && globalWeightRaw > 0 ? String(globalWeightRaw) : '1';
  return {
    name: site.name ?? '',
    url: site.url ?? '',
    externalCheckinUrl: site.externalCheckinUrl ?? '',
    platform: site.platform ?? '',
    proxyUrl: site.proxyUrl ?? '',
    useSystemProxy: !!site.useSystemProxy,
    apiEndpoints: parseApiEndpointsForEditor(site.apiEndpoints),
    globalWeight,
  };
}

// Keep this in sync with normalizeSiteApiEndpointBaseUrl in
// src/server/services/siteApiEndpointService.ts.
function normalizeSiteApiEndpointUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function serializeSiteApiEndpoints(fields: SiteApiEndpointField[]): {
  valid: boolean;
  apiEndpoints: Array<{
    url: string;
    enabled: boolean;
    sortOrder: number;
  }>;
  error?: string;
} {
  const apiEndpoints: Array<{
    url: string;
    enabled: boolean;
    sortOrder: number;
  }> = [];
  const seen = new Set<string>();

  for (const field of fields) {
    const rawUrl = field.url.trim();
    if (!rawUrl) continue;
    const normalizedUrl = normalizeSiteApiEndpointUrl(rawUrl);
    if (!normalizedUrl) continue;
    if (seen.has(normalizedUrl)) {
      return {
        valid: false,
        apiEndpoints: [],
        error: `API 请求地址 "${normalizedUrl}" 重复了`,
      };
    }
    seen.add(normalizedUrl);
    apiEndpoints.push({
      url: normalizedUrl || rawUrl,
      enabled: field.enabled !== false,
      sortOrder: apiEndpoints.length,
    });
  }

  return {
    valid: true,
    apiEndpoints,
  };
}

export function buildSiteSaveAction(editor: SiteEditorState, form: SiteSavePayload): SiteSaveAction {
  if (editor.mode === 'edit') {
    if (!Number.isFinite(editor.editingSiteId)) {
      throw new Error('editingSiteId is required in edit mode');
    }
    return { kind: 'update', id: editor.editingSiteId, payload: form };
  }
  return { kind: 'add', payload: form };
}
