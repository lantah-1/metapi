import { Headers } from 'undici';
import {
  parseCustomHeadersInput,
  readCustomHeaders,
  type ParsedCustomHeadersInput,
} from './customHeaders.js';

export type RouteCustomHeaderSource = {
  routeHeaderTemplateHeaders?: unknown;
  routeCustomHeaders?: unknown;
};

export function parseRouteCustomHeadersInput(input: unknown): ParsedCustomHeadersInput {
  return parseCustomHeadersInput(input);
}

export function mergeHeadersWithRouteCustomHeaders(
  source: RouteCustomHeaderSource | null | undefined,
  requestHeaders: Record<string, string>,
): Record<string, string> {
  const templateHeaders = readCustomHeaders(source?.routeHeaderTemplateHeaders);
  const routeHeaders = readCustomHeaders(source?.routeCustomHeaders);
  if (!templateHeaders && !routeHeaders) {
    return requestHeaders;
  }

  const merged = new Headers();
  if (templateHeaders) {
    for (const [key, value] of Object.entries(templateHeaders)) {
      merged.set(key, value);
    }
  }
  if (routeHeaders) {
    for (const [key, value] of Object.entries(routeHeaders)) {
      merged.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(requestHeaders)) {
    merged.set(key, value);
  }
  return Object.fromEntries(merged.entries());
}
