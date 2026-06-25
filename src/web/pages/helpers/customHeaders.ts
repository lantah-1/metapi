export type CustomHeaderField = {
  key: string;
  value: string;
};

export function emptyCustomHeaderField(): CustomHeaderField {
  return { key: '', value: '' };
}

function ensureRows(rows: CustomHeaderField[]): CustomHeaderField[] {
  return rows.length > 0 ? rows : [emptyCustomHeaderField()];
}

export function parseCustomHeadersForEditor(raw: unknown): CustomHeaderField[] {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return ensureRows(Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : String(value ?? ''),
    })));
  }

  if (typeof raw !== 'string') {
    return ensureRows([]);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return ensureRows([]);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return ensureRows([]);
    }
    return ensureRows(Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : String(value ?? ''),
    })));
  } catch {
    return ensureRows([]);
  }
}

export function serializeCustomHeaders(fields: CustomHeaderField[]): {
  valid: boolean;
  customHeaders: string;
  headersObject: Record<string, string>;
  error?: string;
} {
  const headers: Record<string, string> = {};
  const seen = new Set<string>();

  for (const field of fields) {
    const key = field.key.trim();
    const value = field.value;
    const hasAnyInput = key.length > 0 || value.trim().length > 0;
    if (!hasAnyInput) continue;
    if (!key) {
      return { valid: false, customHeaders: '', headersObject: {}, error: 'Header 名称不能为空' };
    }
    const normalizedKey = key.toLowerCase();
    if (seen.has(normalizedKey)) {
      return { valid: false, customHeaders: '', headersObject: {}, error: `Header "${key}" 重复了` };
    }
    seen.add(normalizedKey);
    headers[key] = value;
  }

  return {
    valid: true,
    customHeaders: Object.keys(headers).length > 0 ? JSON.stringify(headers) : '',
    headersObject: headers,
  };
}
