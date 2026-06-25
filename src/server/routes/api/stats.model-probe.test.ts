import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const queueModelAvailabilityProbeTaskMock = vi.fn();

vi.mock('../../services/modelAvailabilityProbeService.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/modelAvailabilityProbeService.js')>('../../services/modelAvailabilityProbeService.js');
  return {
    ...actual,
    queueModelAvailabilityProbeTask: (...args: unknown[]) => queueModelAvailabilityProbeTaskMock(...args),
  };
});

describe('/api/models/probe', () => {
  let app: FastifyInstance;
  let dataDir = '';
  let originalDataDir: string | undefined;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-stats-model-probe-'));
    originalDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const routesModule = await import('./stats.js');
    app = Fastify();
    await app.register(routesModule.statsRoutes);
  });

  afterAll(async () => {
    await app.close();
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
  });

  it('does not expose model availability probing as a management endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/models/probe',
      payload: {
        accountId: 7,
        wait: true,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(queueModelAvailabilityProbeTaskMock).not.toHaveBeenCalled();
  });
});
