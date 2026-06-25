import { z } from 'zod';

const routeHeaderTemplateCreatePayloadSchema = z.object({
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  headers: z.unknown().optional(),
}).passthrough();

const routeHeaderTemplateUpdatePayloadSchema = z.object({
  name: z.string().optional(),
  description: z.union([z.string(), z.null()]).optional(),
  headers: z.unknown().optional(),
}).passthrough();

export type RouteHeaderTemplateCreatePayload = z.output<typeof routeHeaderTemplateCreatePayloadSchema>;
export type RouteHeaderTemplateUpdatePayload = z.output<typeof routeHeaderTemplateUpdatePayloadSchema>;

function normalizeInput(input: unknown): unknown {
  return input === undefined ? {} : input;
}

function formatPayloadError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  const [firstPath] = firstIssue?.path ?? [];
  if (!firstPath) return '请求体必须是对象';
  if (firstPath === 'name') return 'Invalid name. Expected string.';
  if (firstPath === 'description') return 'Invalid description. Expected string or null.';
  return 'Invalid route header template payload.';
}

function parsePayload<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): { success: true; data: z.output<T> } | { success: false; error: string } {
  const result = schema.safeParse(normalizeInput(input));
  if (!result.success) {
    return { success: false, error: formatPayloadError(result.error) };
  }
  return { success: true, data: result.data };
}

export function parseRouteHeaderTemplateCreatePayload(input: unknown):
{ success: true; data: RouteHeaderTemplateCreatePayload } | { success: false; error: string } {
  return parsePayload(routeHeaderTemplateCreatePayloadSchema, input);
}

export function parseRouteHeaderTemplateUpdatePayload(input: unknown):
{ success: true; data: RouteHeaderTemplateUpdatePayload } | { success: false; error: string } {
  return parsePayload(routeHeaderTemplateUpdatePayloadSchema, input);
}
