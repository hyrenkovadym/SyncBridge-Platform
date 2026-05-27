import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';

type RateLimitRule = {
  name: string;
  method: 'POST' | 'PATCH';
  path: RegExp;
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    name: 'auth_register',
    method: 'POST',
    path: /^\/auth\/register$/,
    limit: 20,
    windowMs: 60_000,
  },
  {
    name: 'auth_login',
    method: 'POST',
    path: /^\/auth\/login$/,
    limit: 20,
    windowMs: 60_000,
  },
  {
    name: 'auth_refresh',
    method: 'POST',
    path: /^\/auth\/refresh$/,
    limit: 40,
    windowMs: 60_000,
  },
  {
    name: 'webhook_intake',
    method: 'POST',
    path: /^\/webhooks\/[^/]+\/events$/,
    limit: 120,
    windowMs: 60_000,
  },
  {
    name: 'pipeline_runs',
    method: 'POST',
    path: /^\/pipelines\/[^/]+\/runs$/,
    limit: 60,
    windowMs: 60_000,
  },
  {
    name: 'pipeline_preview',
    method: 'POST',
    path: /^\/pipelines\/[^/]+\/preview$/,
    limit: 60,
    windowMs: 60_000,
  },
  {
    name: 'schedule_trigger',
    method: 'POST',
    path: /^\/pipelines\/[^/]+\/schedule\/trigger$/,
    limit: 40,
    windowMs: 60_000,
  },
];

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly counters = new Map<string, Bucket>();
  private lastCleanupAt = 0;
  private readonly disabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.disabled = this.configService.get<string>('NODE_ENV', 'development') === 'test';
  }

  use(request: Request, response: Response, next: NextFunction) {
    if (this.disabled) {
      next();
      return;
    }

    const rule = this.matchRule(request.method, request.path || request.url);
    if (!rule) {
      next();
      return;
    }

    this.cleanupExpiredBuckets(Date.now());

    const key = this.buildKey(rule.name, request.ip ?? 'unknown');
    const now = Date.now();
    const existing = this.counters.get(key);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + rule.windowMs }
      : existing;

    bucket.count += 1;
    this.counters.set(key, bucket);

    response.setHeader('X-RateLimit-Limit', String(rule.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(rule.limit - bucket.count, 0)));
    response.setHeader('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));

    if (bucket.count > rule.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfterSeconds));
      next(
        new HttpException(
          `Rate limit exceeded for ${rule.name}. Retry after ${retryAfterSeconds} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
      return;
    }

    next();
  }

  private buildKey(ruleName: string, ip: string) {
    return `${ruleName}:${ip}`;
  }

  private normalizePath(path: string) {
    const cleanedPath = path.split('?')[0] ?? '';
    return cleanedPath.startsWith('/api/') ? cleanedPath.slice(4) : cleanedPath;
  }

  private matchRule(method: string, path: string) {
    const normalizedPath = this.normalizePath(path);
    return RATE_LIMIT_RULES.find((rule) => rule.method === method && rule.path.test(normalizedPath));
  }

  private cleanupExpiredBuckets(now: number) {
    if (now - this.lastCleanupAt < 30_000) {
      return;
    }
    this.lastCleanupAt = now;

    for (const [key, bucket] of this.counters.entries()) {
      if (bucket.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }
}
