import { describe, expect, it } from 'vitest';
import {
  buildSiteSaveAction,
  emptySiteApiEndpoint,
  emptySiteForm,
  serializeSiteApiEndpoints,
  siteFormFromSite,
} from './sitesEditor.js';

describe('buildSiteSaveAction', () => {
  it('returns add action in add mode', () => {
    const action = buildSiteSaveAction(
      { mode: 'add' },
      {
        name: 'site-a',
        url: 'https://a.example.com/',
        externalCheckinUrl: 'https://checkin.a.example.com',
        platform: 'new-api',
        proxyUrl: 'socks5://127.0.0.1:1080',
        apiEndpoints: [
          { url: 'https://api-a.example.com', enabled: true, sortOrder: 0 },
          { url: 'https://api-b.example.com', enabled: false, sortOrder: 1 },
        ],
        useSystemProxy: false,
        globalWeight: 1.2,
      },
    );

    expect(action).toEqual({
      kind: 'add',
      payload: {
        name: 'site-a',
        url: 'https://a.example.com/',
        externalCheckinUrl: 'https://checkin.a.example.com',
        platform: 'new-api',
        proxyUrl: 'socks5://127.0.0.1:1080',
        apiEndpoints: [
          { url: 'https://api-a.example.com', enabled: true, sortOrder: 0 },
          { url: 'https://api-b.example.com', enabled: false, sortOrder: 1 },
        ],
        useSystemProxy: false,
        globalWeight: 1.2,
      },
    });
  });

  it('returns update action in edit mode with site id', () => {
    const action = buildSiteSaveAction(
      { mode: 'edit', editingSiteId: 12 },
      {
        name: 'site-b',
        url: 'https://b.example.com',
        externalCheckinUrl: '',
        platform: 'one-api',
        proxyUrl: '',
        useSystemProxy: true,
        apiEndpoints: [],
        globalWeight: 0.8,
      },
    );

    expect(action).toEqual({
      kind: 'update',
      id: 12,
      payload: {
        name: 'site-b',
        url: 'https://b.example.com',
        externalCheckinUrl: '',
        platform: 'one-api',
        proxyUrl: '',
        useSystemProxy: true,
        apiEndpoints: [],
        globalWeight: 0.8,
      },
    });
  });

  it('throws when edit mode has no site id', () => {
    expect(() =>
      buildSiteSaveAction(
        { mode: 'edit' } as unknown as Parameters<typeof buildSiteSaveAction>[0],
        {
          name: 'site-c',
          url: 'https://c.example.com',
          externalCheckinUrl: '',
          platform: '',
          proxyUrl: '',
          useSystemProxy: false,
          apiEndpoints: [],
          globalWeight: 1,
        },
      ),
    ).toThrow('editingSiteId is required in edit mode');
  });

  it('does not expose deprecated apiKey in site editor state', () => {
    const legacySite = {
      name: 'site-d',
      url: 'https://d.example.com',
      externalCheckinUrl: null,
      platform: 'new-api',
      proxyUrl: 'http://127.0.0.1:8080',
      apiEndpoints: [
        {
          url: 'https://api.example.com',
          enabled: false,
          cooldownUntil: '2026-04-01T00:05:00.000Z',
          lastFailureReason: 'HTTP 502',
        },
      ],
      customHeaders: '{"x-site-token":"alpha"}',
      globalWeight: 1,
      apiKey: 'sk-legacy-site-key',
    } as unknown as Parameters<typeof siteFormFromSite>[0];

    expect(emptySiteForm()).not.toHaveProperty('apiKey');
    expect(emptySiteForm()).not.toHaveProperty('customHeaders');
    expect(emptySiteForm().apiEndpoints).toEqual([emptySiteApiEndpoint()]);
    expect(emptySiteForm().proxyUrl).toBe('');
    expect(siteFormFromSite(legacySite)).not.toHaveProperty('apiKey');
    expect(siteFormFromSite(legacySite)).not.toHaveProperty('customHeaders');
    expect(siteFormFromSite({
      proxyUrl: 'http://127.0.0.1:8080',
    }).proxyUrl).toBe('http://127.0.0.1:8080');
    expect(siteFormFromSite(legacySite).apiEndpoints).toEqual([
      {
        url: 'https://api.example.com',
        enabled: false,
        cooldownUntil: '2026-04-01T00:05:00.000Z',
        lastFailureReason: 'HTTP 502',
      },
    ]);
  });

  it('serializes api endpoint rows into ordered payloads', () => {
    expect(serializeSiteApiEndpoints([
      { url: 'https://api-a.example.com/', enabled: true },
      { url: 'https://api-b.example.com', enabled: false },
      emptySiteApiEndpoint(),
    ])).toEqual({
      valid: true,
      apiEndpoints: [
        { url: 'https://api-a.example.com', enabled: true, sortOrder: 0 },
        { url: 'https://api-b.example.com', enabled: false, sortOrder: 1 },
      ],
    });
  });

  it('rejects duplicate api endpoints after normalization', () => {
    expect(serializeSiteApiEndpoints([
      { url: 'https://api.example.com/', enabled: true },
      { url: 'https://api.example.com', enabled: true },
    ])).toEqual({
      valid: false,
      apiEndpoints: [],
      error: 'API 请求地址 "https://api.example.com" 重复了',
    });
  });
});
