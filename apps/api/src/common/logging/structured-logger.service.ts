import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  REQUEST_CONTEXT_SENSITIVE_KEYS,
  REQUEST_ID_HEADER,
} from '../request-context.constants';
import { RequestContextService } from '../request-context.service';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Injectable()
export class StructuredLoggerService {
  private readonly isTestEnv: boolean;

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly configService: ConfigService,
  ) {
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';
  }

  debug(event: string, metadata?: Record<string, unknown>) {
    this.write('debug', event, metadata);
  }

  info(event: string, metadata?: Record<string, unknown>) {
    this.write('info', event, metadata);
  }

  warn(event: string, metadata?: Record<string, unknown>) {
    this.write('warn', event, metadata);
  }

  error(event: string, metadata?: Record<string, unknown>) {
    this.write('error', event, metadata);
  }

  private write(level: LogLevel, event: string, metadata?: Record<string, unknown>) {
    if (this.isTestEnv) {
      return;
    }

    const context = this.requestContext.get();
    const payload = this.compact({
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId:
        context?.requestId ??
        (typeof metadata?.[REQUEST_ID_HEADER] === 'string'
          ? (metadata[REQUEST_ID_HEADER] as string)
          : undefined),
      userId: context?.userId,
      ...this.sanitizeObject(metadata ?? {}),
    });

    const serialized = JSON.stringify(payload);
    switch (level) {
      case 'debug':
        console.debug(serialized);
        return;
      case 'info':
        console.info(serialized);
        return;
      case 'warn':
        console.warn(serialized);
        return;
      case 'error':
        console.error(serialized);
        return;
      default:
        console.log(serialized);
    }
  }

  private sanitizeObject(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
    if (depth > 4) {
      return {};
    }

    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const normalizedKey = key.toLowerCase();
      if (REQUEST_CONTEXT_SENSITIVE_KEYS.has(normalizedKey)) {
        output[key] = 'REDACTED';
        continue;
      }

      if (value instanceof Error) {
        output[key] = value.message;
        continue;
      }

      if (Array.isArray(value)) {
        output[key] = value.slice(0, 20).map((item) => {
          if (typeof item === 'object' && item !== null) {
            return this.sanitizeObject(item as Record<string, unknown>, depth + 1);
          }
          return item;
        });
        continue;
      }

      if (typeof value === 'object' && value !== null) {
        output[key] = this.sanitizeObject(value as Record<string, unknown>, depth + 1);
        continue;
      }

      output[key] = value;
    }

    return output;
  }

  private compact(value: Record<string, unknown>) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        continue;
      }
      output[key] = item;
    }
    return output;
  }
}
