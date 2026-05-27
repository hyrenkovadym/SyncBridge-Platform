import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

import { REQUEST_ID_HEADER } from '../request-context.constants';
import { RequestContextService } from '../request-context.service';

type RequestWithContext = Request & { requestId?: string };

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: RequestWithContext, response: Response, next: NextFunction) {
    const incomingRequestId = this.getHeaderValue(request.headers[REQUEST_ID_HEADER]);
    const requestId = this.isValidRequestId(incomingRequestId) ? incomingRequestId : randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);

    this.requestContext.run(
      {
        requestId,
        method: request.method,
        path: request.originalUrl || request.url,
      },
      () => next(),
    );
  }

  private getHeaderValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  }

  private isValidRequestId(value: string) {
    return REQUEST_ID_PATTERN.test(value);
  }
}
