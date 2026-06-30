import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../db/index.js');
type TokenRouterModule = typeof import('./tokenRouter.js');

describe('TokenRouter patterns and model mapping', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let TokenRouter: TokenRouterModule['TokenRouter'];
  let invalidateTokenRouterCache: TokenRouterModule['invalidateTokenRouterCache'];
  let tokenRouterTestUtils: TokenRouterModule['__tokenRouterTestUtils'];
  let dataDir = '';
  let idSeed = 0;

  const nextId = () => {
    idSeed += 1;
    return idSeed;
  };

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-token-router-patterns-'));
    process.env.DATA_DIR = dataDir;

    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    const tokenRouterModule = await import('./tokenRouter.js');
    db = dbModule.db;
    schema = dbModule.schema;
    TokenRouter = tokenRouterModule.TokenRouter;
    invalidateTokenRouterCache = tokenRouterModule.invalidateTokenRouterCache;
    tokenRouterTestUtils = tokenRouterModule.__tokenRouterTestUtils;
  });

  beforeEach(async () => {
    idSeed = 0;
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
    invalidateTokenRouterCache();
  });

  afterAll(() => {
    invalidateTokenRouterCache();
    delete process.env.DATA_DIR;
  });

  async function createSite(namePrefix: string) {
    const id = nextId();
    return await db.insert(schema.sites).values({
      name: `${namePrefix}-${id}`,
      url: `https://${namePrefix}-${id}.example.com`,
      platform: 'new-api',
      status: 'active',
    }).returning().get();
  }

  async function createAccount(siteId: number, usernamePrefix: string) {
    const id = nextId();
    return await db.insert(schema.accounts).values({
      siteId,
      username: `${usernamePrefix}-${id}`,
      accessToken: `access-${id}`,
      apiToken: `sk-${id}`,
      status: 'active',
    }).returning().get();
  }

  async function createRouteWithSingleChannel(
    modelPattern: string,
    modelMapping?: string,
    options?: { displayName?: string; sourceModel?: string | null },
  ) {
    const site = await createSite('pattern-site');
    const account = await createAccount(site.id, 'pattern-user');
    const route = await db.insert(schema.tokenRoutes).values({
      modelPattern,
      displayName: options?.displayName,
      modelMapping,
      enabled: true,
    }).returning().get();
    const channel = await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: account.id,
      tokenId: null,
      sourceModel: options?.sourceModel ?? null,
      priority: 0,
      weight: 10,
      enabled: true,
    }).returning().get();
    return { route, channel };
  }

  async function createExplicitGroupRoute(
    displayName: string,
    sourceRouteIds: number[],
    options?: {
      customHeaderTemplateId?: number | null;
      customHeaders?: string | null;
    },
  ) {
    const route = await db.insert(schema.tokenRoutes).values({
      modelPattern: displayName,
      displayName,
      routeMode: 'explicit_group',
      customHeaderTemplateId: options?.customHeaderTemplateId ?? null,
      customHeaders: options?.customHeaders ?? null,
      enabled: true,
    }).returning().get();

    await db.insert(schema.routeGroupSources).values(
      sourceRouteIds.map((sourceRouteId) => ({
        groupRouteId: route.id,
        sourceRouteId,
      })),
    ).run();

    return route;
  }

  async function createSwitchGroupRoute(
    displayName: string,
    sourceRouteIds: number[],
    activeSourceRouteId: number,
    options?: { customHeaderTemplateId?: number | null; activeSourceSiteId?: number | null },
  ) {
    const route = await db.insert(schema.tokenRoutes).values({
      modelPattern: displayName,
      displayName,
      routeMode: 'switch_group',
      modelMapping: JSON.stringify({
        activeSourceRouteId,
        ...(options?.activeSourceSiteId ? { activeSourceSiteId: options.activeSourceSiteId } : {}),
      }),
      customHeaderTemplateId: options?.customHeaderTemplateId ?? null,
      routingStrategy: 'stable_first',
      enabled: true,
    }).returning().get();

    await db.insert(schema.routeGroupSources).values(
      sourceRouteIds.map((sourceRouteId) => ({
        groupRouteId: route.id,
        sourceRouteId,
      })),
    ).run();

    return route;
  }

  it('matches routes with re: regex patterns', async () => {
    await createRouteWithSingleChannel('re:^claude-(opus|sonnet)-4-6$');
    const router = new TokenRouter();

    const matched = await router.selectChannel('claude-opus-4-6');
    const unmatched = await router.selectChannel('claude-haiku-4-6');

    expect(matched).toBeTruthy();
    expect(matched?.actualModel).toBe('claude-opus-4-6');
    expect(unmatched).toBeNull();
  });

  it('ignores invalid re: patterns and falls back to next matched route', async () => {
    const invalid = await createRouteWithSingleChannel('re:([a-z');
    const glob = await createRouteWithSingleChannel('claude-*');
    const router = new TokenRouter();

    const selected = await router.selectChannel('claude-opus-4-6');
    expect(selected).toBeTruthy();
    expect(selected?.channel.id).toBe(glob.channel.id);
    expect(selected?.channel.id).not.toBe(invalid.channel.id);
  });

  it('supports exact, glob and re: keys in modelMapping with exact taking precedence', async () => {
    const mapping = JSON.stringify({
      'claude-sonnet-4-6': 'target-exact',
      'claude-sonnet-*': 'target-glob',
      're:^gpt-4o-mini-\\d+$': 'target-regex',
    });
    await createRouteWithSingleChannel('*', mapping);
    const router = new TokenRouter();

    const exact = await router.selectChannel('claude-sonnet-4-6');
    const glob = await router.selectChannel('claude-sonnet-4-7');
    const regex = await router.selectChannel('gpt-4o-mini-20250101');

    expect(exact?.actualModel).toBe('target-exact');
    expect(glob?.actualModel).toBe('target-glob');
    expect(regex?.actualModel).toBe('target-regex');
  });

  it('resolves mapped models from parsed object input for helper-level callers', () => {
    expect(tokenRouterTestUtils.resolveMappedModel('claude-sonnet-4-6', {
      'claude-sonnet-4-6': 'target-exact',
      'claude-sonnet-*': 'target-glob',
    })).toBe('target-exact');
    expect(tokenRouterTestUtils.resolveMappedModel('claude-sonnet-4-7', {
      'claude-sonnet-4-6': 'target-exact',
      'claude-sonnet-*': 'target-glob',
    })).toBe('target-glob');
  });

  it('matches a route by display name alias as an exposed model', async () => {
    await createRouteWithSingleChannel(
      're:^claude-(opus|sonnet)-4-5$',
      undefined,
      {
        displayName: 'claude-opus-4-6',
        sourceModel: 'claude-opus-4-5',
      },
    );
    const router = new TokenRouter();

    const selected = await router.selectChannel('claude-opus-4-6');
    const decision = await router.explainSelection('claude-opus-4-6');
    const exposedModels = await router.getAvailableModels();

    expect(selected).toBeTruthy();
    expect(selected?.actualModel).toBe('claude-opus-4-5');
    expect(decision.actualModel).toBe('claude-opus-4-5');
    expect(exposedModels).toContain('claude-opus-4-6');
  });

  it('prefers a group display-name alias over a colliding exact route', async () => {
    const source = await createRouteWithSingleChannel(
      'claude-opus-4-5',
      undefined,
      {
        sourceModel: 'claude-opus-4-5',
      },
    );
    const exact = await createRouteWithSingleChannel(
      'claude-opus-4-6',
      undefined,
      {
        sourceModel: 'claude-opus-4-6',
      },
    );
    const grouped = await createExplicitGroupRoute('claude-opus-4-6', [source.route.id]);
    const router = new TokenRouter();

    const selected = await router.selectChannel('claude-opus-4-6');
    const decision = await router.explainSelection('claude-opus-4-6');

    expect(selected).toBeTruthy();
    expect(selected?.channel.routeId).toBe(source.route.id);
    expect(selected?.channel.id).not.toBe(exact.channel.id);
    expect(selected?.actualModel).toBe('claude-opus-4-5');
    expect(decision.routeId).toBe(grouped.id);
    expect(decision.actualModel).toBe('claude-opus-4-5');
  });

  it('falls back to the source exact-route model when explicit-group channels omit sourceModel', async () => {
    const source = await createRouteWithSingleChannel('claude-opus-4-5');
    await createExplicitGroupRoute('claude-test-4.6-sonnet', [source.route.id]);
    const router = new TokenRouter();

    const selected = await router.selectChannel('claude-test-4.6-sonnet');
    const decision = await router.explainSelection('claude-test-4.6-sonnet');

    expect(selected).toBeTruthy();
    expect(selected?.actualModel).toBe('claude-opus-4-5');
    expect(decision.actualModel).toBe('claude-opus-4-5');
    expect(decision.summary).toContain('按显示名命中：claude-test-4.6-sonnet');
    expect(decision.summary).toContain('实际转发模型：claude-opus-4-5');
  });

  it('carries explicit-group custom headers and template headers into the selected channel', async () => {
    const source = await createRouteWithSingleChannel('gpt-5.5');
    const template = await db.insert(schema.routeHeaderTemplates).values({
      name: 'Codex Header',
      headers: JSON.stringify({ 'x-template': 'codex' }),
    }).returning().get();
    await createExplicitGroupRoute('gpt-5.5-public', [source.route.id], {
      customHeaderTemplateId: template.id,
      customHeaders: JSON.stringify({ 'x-group': 'gpt' }),
    });
    const router = new TokenRouter();

    const selected = await router.selectChannel('gpt-5.5-public');

    expect(selected).toBeTruthy();
    expect(selected?.routeHeaderTemplateId).toBe(template.id);
    expect(selected?.routeHeaderTemplateHeaders).toBe(JSON.stringify({ 'x-template': 'codex' }));
    expect(selected?.routeCustomHeaders).toBe(JSON.stringify({ 'x-group': 'gpt' }));
  });

  it('uses the active target headers when switch group has no header template', async () => {
    const source = await createRouteWithSingleChannel('gpt-5.5');
    await db.update(schema.tokenRoutes).set({
      customHeaders: JSON.stringify({ 'x-target': 'group' }),
    }).where(eq(schema.tokenRoutes.id, source.route.id)).run();
    const switchGroup = await createSwitchGroupRoute('gpt-switch', [source.route.id], source.route.id);
    await db.update(schema.tokenRoutes).set({
      customHeaders: JSON.stringify({ 'x-switch': 'ignored' }),
    }).where(eq(schema.tokenRoutes.id, switchGroup.id)).run();
    invalidateTokenRouterCache();
    const router = new TokenRouter();

    const selected = await router.selectChannel('gpt-switch');

    expect(selected).toBeTruthy();
    expect(selected?.routeCustomHeaders).toBe(JSON.stringify({ 'x-target': 'group' }));
  });

  it('uses switch-group header template ahead of active target headers when selected', async () => {
    const source = await createRouteWithSingleChannel('gpt-5.5');
    const switchTemplate = await db.insert(schema.routeHeaderTemplates).values({
      name: 'Switch Header',
      headers: JSON.stringify({ 'x-switch-template': 'switch' }),
    }).returning().get();
    await db.update(schema.tokenRoutes).set({
      customHeaders: JSON.stringify({ 'x-target': 'group' }),
    }).where(eq(schema.tokenRoutes.id, source.route.id)).run();
    await createSwitchGroupRoute('gpt-switch', [source.route.id], source.route.id, {
      customHeaderTemplateId: switchTemplate.id,
    });
    const router = new TokenRouter();

    const selected = await router.selectChannel('gpt-switch');

    expect(selected).toBeTruthy();
    expect(selected?.routeHeaderTemplateId).toBe(switchTemplate.id);
    expect(selected?.routeHeaderTemplateHeaders).toBe(JSON.stringify({ 'x-switch-template': 'switch' }));
    expect(selected?.routeCustomHeaders).toBeNull();
  });

  it('routes a switch group directly through the active exact target', async () => {
    const gptSource = await createRouteWithSingleChannel('openai/gpt-5.5', undefined, {
      sourceModel: 'openai/gpt-5.5',
    });
    const claudeSource = await createRouteWithSingleChannel('anthropic/claude-sonnet', undefined, {
      sourceModel: 'anthropic/claude-sonnet',
    });
    const switchGroup = await createSwitchGroupRoute(
      'custom',
      [gptSource.route.id, claudeSource.route.id],
      gptSource.route.id,
    );
    const router = new TokenRouter();

    const initial = await router.selectChannel('custom');
    expect(initial).toBeTruthy();
    expect(initial?.channel.routeId).toBe(gptSource.route.id);
    expect(initial?.actualModel).toBe('openai/gpt-5.5');
    await expect(router.getAvailableModels()).resolves.toEqual(expect.arrayContaining(['custom']));

    await db.update(schema.tokenRoutes).set({
      modelMapping: JSON.stringify({ activeSourceRouteId: claudeSource.route.id }),
    }).where(eq(schema.tokenRoutes.id, switchGroup.id)).run();
    invalidateTokenRouterCache();

    const switched = await router.selectChannel('custom');
    const decision = await router.explainSelection('custom');
    expect(switched).toBeTruthy();
    expect(switched?.channel.routeId).toBe(claudeSource.route.id);
    expect(switched?.actualModel).toBe('anthropic/claude-sonnet');
    expect(decision.routeId).toBe(switchGroup.id);
    expect(decision.actualModel).toBe('anthropic/claude-sonnet');
  });

  it('limits a switch group active target to the selected supplier site', async () => {
    const siteA = await createSite('supplier-a');
    const accountA = await createAccount(siteA.id, 'supplier-a-user');
    const siteB = await createSite('supplier-b');
    const accountB = await createAccount(siteB.id, 'supplier-b-user');
    const siteC = await createSite('supplier-c');
    const accountC = await createAccount(siteC.id, 'supplier-c-user');
    const route = await db.insert(schema.tokenRoutes).values({
      modelPattern: 'gpt-5.5',
      enabled: true,
      routingStrategy: 'weighted',
    }).returning().get();
    const channelA = await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: accountA.id,
      tokenId: null,
      sourceModel: 'gpt-5.5',
      priority: 0,
      weight: 100,
      enabled: true,
    }).returning().get();
    const channelB = await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: accountB.id,
      tokenId: null,
      sourceModel: 'gpt-5.5',
      priority: 0,
      weight: 1,
      enabled: true,
    }).returning().get();
    const channelC = await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: accountC.id,
      tokenId: null,
      sourceModel: 'gpt-5.5',
      priority: 0,
      weight: 100,
      enabled: true,
    }).returning().get();
    const switchGroup = await createSwitchGroupRoute('custom-gpt', [route.id], route.id, {
      activeSourceSiteId: siteB.id,
    });
    invalidateTokenRouterCache();
    const router = new TokenRouter();

    const selected = await router.selectChannel('custom-gpt');
    const decision = await router.explainSelection('custom-gpt');

    expect(selected).toBeTruthy();
    expect(selected?.channel.id).toBe(channelB.id);
    expect(selected?.site.id).toBe(siteB.id);
    expect(decision.routeId).toBe(switchGroup.id);
    expect(decision.candidates.map((candidate) => candidate.channelId)).toEqual([channelB.id]);
    expect(decision.candidates.some((candidate) => candidate.channelId === channelA.id)).toBe(false);
    expect(decision.candidates.some((candidate) => candidate.channelId === channelC.id)).toBe(false);
  });

  it('does not expand an active explicit group target for switch groups', async () => {
    const source = await createRouteWithSingleChannel('openai/gpt-5.5', undefined, {
      sourceModel: 'openai/gpt-5.5',
    });
    const grouped = await createExplicitGroupRoute('gpt-public', [source.route.id]);
    await createSwitchGroupRoute('gpt-switch', [grouped.id], grouped.id);
    const router = new TokenRouter();

    const selected = await router.selectChannel('gpt-switch');

    expect(selected).toBeNull();
  });

  it('uses the active target strategy instead of the switch group strategy', async () => {
    const active = await createRouteWithSingleChannel('any-gpt-5.5', undefined, {
      sourceModel: 'any-gpt-5.5',
    });
    await db.update(schema.tokenRoutes).set({
      routingStrategy: 'round_robin',
    }).where(eq(schema.tokenRoutes.id, active.route.id)).run();
    await db.update(schema.routeChannels).set({
      failCount: 1,
      lastFailAt: new Date().toISOString(),
      lastSelectedAt: '2024-01-01T00:00:00.000Z',
    }).where(eq(schema.routeChannels.id, active.channel.id)).run();

    const secondSite = await createSite('switch-strategy-site');
    const secondAccount = await createAccount(secondSite.id, 'switch-strategy-user');
    const secondChannel = await db.insert(schema.routeChannels).values({
      routeId: active.route.id,
      accountId: secondAccount.id,
      tokenId: null,
      sourceModel: 'any-gpt-5.5',
      priority: 0,
      weight: 10,
      enabled: true,
      lastSelectedAt: '2025-01-01T00:00:00.000Z',
    }).returning().get();

    await createSwitchGroupRoute('custom-gpt', [active.route.id], active.route.id);
    invalidateTokenRouterCache();
    const router = new TokenRouter();

    const selected = await router.selectChannel('custom-gpt');
    const decision = await router.explainSelection('custom-gpt');

    expect(selected?.channel.id).toBe(active.channel.id);
    expect(selected?.channel.id).not.toBe(secondChannel.id);
    expect(decision.summary).toContain('路由策略：轮询');
  });

  it('does not fall through to another switch target when the active exact target is unavailable', async () => {
    const active = await createRouteWithSingleChannel('any-gpt-5.5', undefined, {
      sourceModel: 'any-gpt-5.5',
    });
    await db.update(schema.routeChannels).set({
      enabled: false,
    }).where(eq(schema.routeChannels.id, active.channel.id)).run();
    const fallback = await createRouteWithSingleChannel('openai/gpt-5.5', undefined, {
      sourceModel: 'openai/gpt-5.5',
    });
    await createSwitchGroupRoute(
      'custom-gpt',
      [active.route.id, fallback.route.id],
      active.route.id,
    );
    invalidateTokenRouterCache();
    const router = new TokenRouter();

    const selected = await router.selectChannel('custom-gpt');
    const decision = await router.explainSelection('custom-gpt');

    expect(selected).toBeNull();
    expect(decision.candidates.some((candidate) => candidate.channelId === fallback.channel.id)).toBe(false);
    expect(decision.summary).toContain('没有可用通道（全部被禁用、站点不可用、冷却或令牌不可用）');
  });
});
