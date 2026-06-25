import type { FastifyInstance } from 'fastify';
import {
  parseRouteHeaderTemplateCreatePayload,
  parseRouteHeaderTemplateUpdatePayload,
} from '../../contracts/routeHeaderTemplatePayloads.js';
import {
  createRouteHeaderTemplate,
  deleteRouteHeaderTemplate,
  getRouteHeaderTemplate,
  listRouteHeaderTemplates,
  updateRouteHeaderTemplate,
} from '../../services/routeHeaderTemplateService.js';
import { invalidateTokenRouterCache } from '../../services/tokenRouter.js';

function parseId(raw: string): number {
  const id = Number(raw);
  return Number.isFinite(id) ? Math.trunc(id) : 0;
}

export async function routeHeaderTemplatesRoutes(app: FastifyInstance) {
  app.get('/api/route-header-templates', async () => {
    return await listRouteHeaderTemplates();
  });

  app.get<{ Params: { id: string } }>('/api/route-header-templates/:id', async (request, reply) => {
    const template = await getRouteHeaderTemplate(parseId(request.params.id));
    if (!template) {
      return reply.code(404).send({ success: false, message: 'Header 模板不存在' });
    }
    return template;
  });

  app.post<{ Body: unknown }>('/api/route-header-templates', async (request, reply) => {
    const parsed = parseRouteHeaderTemplateCreatePayload(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, message: parsed.error });
    }
    const result = await createRouteHeaderTemplate(parsed.data);
    if (!result.ok) {
      return reply.code(400).send({ success: false, message: result.message });
    }
    invalidateTokenRouterCache();
    return reply.code(201).send(result.template);
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/api/route-header-templates/:id', async (request, reply) => {
    const parsed = parseRouteHeaderTemplateUpdatePayload(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, message: parsed.error });
    }
    const result = await updateRouteHeaderTemplate(parseId(request.params.id), parsed.data);
    if (!result.ok) {
      return reply.code(result.notFound ? 404 : 400).send({ success: false, message: result.message });
    }
    invalidateTokenRouterCache();
    return result.template;
  });

  app.delete<{ Params: { id: string } }>('/api/route-header-templates/:id', async (request, reply) => {
    const deleted = await deleteRouteHeaderTemplate(parseId(request.params.id));
    if (!deleted) {
      return reply.code(404).send({ success: false, message: 'Header 模板不存在' });
    }
    invalidateTokenRouterCache();
    return { success: true };
  });
}
