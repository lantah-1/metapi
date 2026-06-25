import { describe, expect, it } from 'vitest';
import { mergeHeadersWithRouteCustomHeaders } from './routeCustomHeaders.js';

describe('mergeHeadersWithRouteCustomHeaders', () => {
  it('merges template, route, and request headers in priority order', () => {
    const headers = mergeHeadersWithRouteCustomHeaders(
      {
        routeHeaderTemplateHeaders: JSON.stringify({
          'x-template': 'base',
          'x-shared': 'template',
          authorization: 'template-token',
        }),
        routeCustomHeaders: JSON.stringify({
          'x-route': 'group',
          'x-shared': 'route',
          authorization: 'route-token',
        }),
      },
      {
        Authorization: 'Bearer request-token',
        'Content-Type': 'application/json',
      },
    );

    expect(headers).toMatchObject({
      'x-template': 'base',
      'x-route': 'group',
      'x-shared': 'route',
      authorization: 'Bearer request-token',
      'content-type': 'application/json',
    });
  });
});
