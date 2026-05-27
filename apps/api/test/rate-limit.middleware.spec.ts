import { HttpException, HttpStatus } from '@nestjs/common';

import { RateLimitMiddleware } from '../src/common/middleware/rate-limit.middleware';

type HeaderMap = Record<string, string>;

function createResponse() {
  const headers: HeaderMap = {};
  return {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    headers,
  };
}

describe('RateLimitMiddleware', () => {
  it('applies rate limit headers and blocks after configured limit', () => {
    const middleware = new RateLimitMiddleware({
      get: (key: string, fallback?: string) => {
        if (key === 'NODE_ENV') {
          return 'development';
        }
        return fallback;
      },
    } as never);

    const request = {
      method: 'POST',
      path: '/api/auth/login',
      url: '/api/auth/login',
      ip: '127.0.0.1',
    } as never;

    const response = createResponse();
    const next = jest.fn();

    for (let i = 0; i < 20; i += 1) {
      middleware.use(request, response as never, next);
      expect(next).toHaveBeenLastCalledWith();
    }

    middleware.use(request, response as never, next);
    const lastCallArgument = next.mock.calls[next.mock.calls.length - 1][0];
    expect(lastCallArgument).toBeInstanceOf(HttpException);
    expect((lastCallArgument as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.headers['X-RateLimit-Limit']).toBe('20');
    expect(response.headers['Retry-After']).toBeDefined();
  });

  it('is disabled in test environment', () => {
    const middleware = new RateLimitMiddleware({
      get: (key: string, fallback?: string) => {
        if (key === 'NODE_ENV') {
          return 'test';
        }
        return fallback;
      },
    } as never);

    const next = jest.fn();
    middleware.use(
      {
        method: 'POST',
        path: '/api/auth/login',
        url: '/api/auth/login',
        ip: '127.0.0.1',
      } as never,
      createResponse() as never,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });
});
