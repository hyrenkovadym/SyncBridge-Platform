import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';

import { RequestContextService } from '../request-context.service';
import { StructuredLoggerService } from '../logging/structured-logger.service';

type RequestWithUser = {
  method?: string;
  originalUrl?: string;
  url?: string;
  requestId?: string;
  user?: { sub?: string };
};

type ResponseLike = {
  statusCode?: number;
};

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<ResponseLike>();
    const startedAt = Date.now();

    if (request?.user?.sub) {
      this.requestContext.setUserId(request.user.sub);
    }

    const method = request?.method ?? 'UNKNOWN';
    const path = request?.originalUrl ?? request?.url ?? '';
    const requestId = request?.requestId;

    return next.handle().pipe(
      tap(() => {
        this.logger.info('request_completed', {
          requestId,
          method,
          path,
          status: response?.statusCode ?? 200,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error: unknown) => {
        this.logger.error('request_failed', {
          requestId,
          method,
          path,
          status:
            typeof (error as { status?: unknown })?.status === 'number'
              ? ((error as { status: number }).status)
              : 500,
          durationMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return throwError(() => error);
      }),
    );
  }
}
