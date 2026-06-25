import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../../db/index.js');

describe('sites disabled models API', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-sites-disabled-models-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./sites.js');
    db = dbModule.db;
    schema = dbModule.schema;

    app = Fastify();
    await app.register(routesModule.sitesRoutes);
  });

  beforeEach(async () => {
    await db.delete(schema.siteDisabledModels).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATA_DIR;
  });

  it('does not expose site-level disabled model management endpoints', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'test-site',
      url: 'https://test-site.example.com',
      platform: 'new-api',
    }).returning().get();

    const getResp = await app.inject({
      method: 'GET',
      url: `/api/sites/${site.id}/disabled-models`,
    });
    const putResp = await app.inject({
      method: 'PUT',
      url: `/api/sites/${site.id}/disabled-models`,
      payload: { models: ['gpt-4o'] },
    });

    expect(getResp.statusCode).toBe(404);
    expect(putResp.statusCode).toBe(404);
  });

  it('keeps legacy site disabled model rows as compatibility data only', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'delete-test',
      url: 'https://delete-test.example.com',
      platform: 'new-api',
    }).returning().get();

    await db.insert(schema.siteDisabledModels).values({
      siteId: site.id,
      modelName: 'gpt-4o',
    }).run();

    await db.delete(schema.sites).where(eq(schema.sites.id, site.id)).run();

    const rows = await db.select().from(schema.siteDisabledModels)
      .where(eq(schema.siteDisabledModels.siteId, site.id))
      .all();
    expect(rows).toHaveLength(0);
  });
});
