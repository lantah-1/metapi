import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireInsertedRowId } from '../db/insertHelpers.js';
import { parseRouteCustomHeadersInput } from './routeCustomHeaders.js';

export type RouteHeaderTemplateRow = typeof schema.routeHeaderTemplates.$inferSelect;

export type RouteHeaderTemplateInput = {
  name?: unknown;
  description?: unknown;
  headers?: unknown;
};

export type RouteHeaderTemplateValidationResult =
  | {
    ok: true;
    values: NormalizedRouteHeaderTemplateValues;
  }
  | {
    ok: false;
    message: string;
  };

type NormalizedRouteHeaderTemplateValues = {
  name?: string;
  description?: string | null;
  headers?: string;
};

function normalizeTemplateName(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function normalizeTemplateDescription(input: unknown): string | null {
  if (input == null) return null;
  const trimmed = typeof input === 'string' ? input.trim() : String(input ?? '').trim();
  return trimmed || null;
}

function normalizeTemplateHeaders(input: unknown): { ok: true; headers: string } | { ok: false; message: string } {
  const parsed = parseRouteCustomHeadersInput(input);
  if (!parsed.valid) {
    return { ok: false, message: parsed.error || 'Header 必须是 JSON 对象' };
  }
  return { ok: true, headers: parsed.customHeaders || '{}' };
}

async function hasTemplateWithName(name: string, excludingId?: number): Promise<boolean> {
  const existing = excludingId
    ? await db.select({ id: schema.routeHeaderTemplates.id })
      .from(schema.routeHeaderTemplates)
      .where(eq(schema.routeHeaderTemplates.name, name))
      .all()
    : await db.select({ id: schema.routeHeaderTemplates.id })
      .from(schema.routeHeaderTemplates)
      .where(eq(schema.routeHeaderTemplates.name, name))
      .all();
  return existing.some((row) => row.id !== excludingId);
}

export async function validateRouteHeaderTemplateCreateInput(
  input: RouteHeaderTemplateInput,
): Promise<RouteHeaderTemplateValidationResult> {
  const name = normalizeTemplateName(input.name);
  if (!name) {
    return { ok: false, message: '模板名称不能为空' };
  }
  if (await hasTemplateWithName(name)) {
    return { ok: false, message: `Header 模板 "${name}" 已存在` };
  }
  const headers = normalizeTemplateHeaders(input.headers ?? {});
  if (!headers.ok) return headers;
  return {
    ok: true,
    values: {
      name,
      description: normalizeTemplateDescription(input.description),
      headers: headers.headers,
    },
  };
}

export async function validateRouteHeaderTemplateUpdateInput(
  id: number,
  input: RouteHeaderTemplateInput,
): Promise<RouteHeaderTemplateValidationResult> {
  const values: NormalizedRouteHeaderTemplateValues = {};

  if (input.name !== undefined) {
    const name = normalizeTemplateName(input.name);
    if (!name) {
      return { ok: false, message: '模板名称不能为空' };
    }
    if (await hasTemplateWithName(name, id)) {
      return { ok: false, message: `Header 模板 "${name}" 已存在` };
    }
    values.name = name;
  }
  if (input.description !== undefined) {
    values.description = normalizeTemplateDescription(input.description);
  }
  if (input.headers !== undefined) {
    const headers = normalizeTemplateHeaders(input.headers);
    if (!headers.ok) return headers;
    values.headers = headers.headers;
  }

  return { ok: true, values };
}

export async function listRouteHeaderTemplates(): Promise<RouteHeaderTemplateRow[]> {
  return await db.select().from(schema.routeHeaderTemplates)
    .orderBy(asc(schema.routeHeaderTemplates.name))
    .all();
}

export async function getRouteHeaderTemplate(id: number): Promise<RouteHeaderTemplateRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  return await db.select().from(schema.routeHeaderTemplates)
    .where(eq(schema.routeHeaderTemplates.id, Math.trunc(id)))
    .get() ?? null;
}

export async function routeHeaderTemplateExists(id: number): Promise<boolean> {
  return !!await getRouteHeaderTemplate(id);
}

export async function createRouteHeaderTemplate(
  input: RouteHeaderTemplateInput,
): Promise<{ ok: true; template: RouteHeaderTemplateRow } | { ok: false; message: string }> {
  const validation = await validateRouteHeaderTemplateCreateInput(input);
  if (!validation.ok) return validation;
  const inserted = await db.insert(schema.routeHeaderTemplates).values(validation.values).run();
  const id = requireInsertedRowId(inserted, '创建 Header 模板失败');
  const template = await getRouteHeaderTemplate(id);
  if (!template) return { ok: false, message: '创建 Header 模板失败' };
  return { ok: true, template };
}

export async function updateRouteHeaderTemplate(
  id: number,
  input: RouteHeaderTemplateInput,
): Promise<{ ok: true; template: RouteHeaderTemplateRow } | { ok: false; message: string; notFound?: boolean }> {
  const template = await getRouteHeaderTemplate(id);
  if (!template) return { ok: false, message: 'Header 模板不存在', notFound: true };
  const validation = await validateRouteHeaderTemplateUpdateInput(template.id, input);
  if (!validation.ok) return validation;
  await db.update(schema.routeHeaderTemplates).set({
    ...validation.values,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.routeHeaderTemplates.id, template.id)).run();
  return { ok: true, template: (await getRouteHeaderTemplate(template.id))! };
}

export async function deleteRouteHeaderTemplate(id: number): Promise<boolean> {
  const template = await getRouteHeaderTemplate(id);
  if (!template) return false;
  await db.update(schema.tokenRoutes)
    .set({ customHeaderTemplateId: null, updatedAt: new Date().toISOString() })
    .where(eq(schema.tokenRoutes.customHeaderTemplateId, template.id))
    .run();
  await db.delete(schema.routeHeaderTemplates)
    .where(eq(schema.routeHeaderTemplates.id, template.id))
    .run();
  return true;
}
