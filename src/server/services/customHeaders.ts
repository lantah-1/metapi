import { Headers, type HeadersInit } from 'undici';

export type CustomHeadersRecord = Record<string, string>;

export type ParsedCustomHeadersInput = {
  present: boolean;
  valid: boolean;
  customHeaders: string | null;
  headers: CustomHeadersRecord | null;
  error?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeCustomHeadersRecord(input: Record<string, unknown>): CustomHeadersRecord | null {
  const normalized = new Headers();

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    if (!key) {
      throw new Error('Header name cannot be empty.');
    }
    if (typeof rawValue !== 'string') {
      throw new Error(`Header "${key}" must use a string value.`);
    }
    normalized.set(key, rawValue);
  }

  const entries = Array.from(normalized.entries()).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

export function parseCustomHeadersInput(input: unknown): ParsedCustomHeadersInput {
  if (input === undefined) {
    return { present: false, valid: true, customHeaders: null, headers: null };
  }
  if (input === null) {
    return { present: true, valid: true, customHeaders: null, headers: null };
  }

  let parsedInput: unknown = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { present: true, valid: true, customHeaders: null, headers: null };
    }
    try {
      parsedInput = JSON.parse(trimmed);
    } catch {
      return {
        present: true,
        valid: false,
        customHeaders: null,
        headers: null,
        error: 'Invalid customHeaders. Expected a JSON object like {"x-header":"value"}.',
      };
    }
  }

  if (!isPlainObject(parsedInput)) {
    return {
      present: true,
      valid: false,
      customHeaders: null,
      headers: null,
      error: 'Invalid customHeaders. Expected a JSON object like {"x-header":"value"}.',
    };
  }

  try {
    const headers = normalizeCustomHeadersRecord(parsedInput);
    return {
      present: true,
      valid: true,
      customHeaders: headers ? JSON.stringify(headers) : null,
      headers,
    };
  } catch (error) {
    return {
      present: true,
      valid: false,
      customHeaders: null,
      headers: null,
      error: error instanceof Error
        ? `Invalid customHeaders. ${error.message}`
        : 'Invalid customHeaders. Expected a JSON object like {"x-header":"value"}.',
    };
  }
}

export function readCustomHeaders(input: unknown): CustomHeadersRecord | null {
  const parsed = parseCustomHeadersInput(input);
  if (!parsed.valid) {
    return null;
  }
  return parsed.headers;
}

export function mergeHeadersWithCustomHeaders(
  customHeaders: unknown,
  requestHeaders?: HeadersInit,
): HeadersInit | undefined {
  const normalizedCustomHeaders = readCustomHeaders(customHeaders);
  if (!normalizedCustomHeaders) {
    return requestHeaders;
  }

  const merged = new Headers(normalizedCustomHeaders);
  if (requestHeaders) {
    const explicitHeaders = new Headers(requestHeaders);
    explicitHeaders.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
}

export function mergeHeaderRecords(
  ...sources: Array<unknown>
): Record<string, string> {
  const merged = new Headers();

  for (const source of sources) {
    if (!source) continue;
    const parsed = readCustomHeaders(source);
    if (!parsed) continue;
    for (const [key, value] of Object.entries(parsed)) {
      merged.set(key, value);
    }
  }

  return Object.fromEntries(merged.entries());
}
