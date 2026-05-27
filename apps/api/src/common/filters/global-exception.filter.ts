import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { StructuredLoggerService } from '../logging/structured-logger.service';

type RequestWithContext = Request & { requestId?: string };

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = request?.requestId;
    const path = request?.originalUrl ?? request?.url ?? '';
    const message = this.extractMessage(exception, statusCode);

    this.logger.error('http_exception', {
      requestId,
      path,
      statusCode,
      message,
    });

    response.status(statusCode).json({
      statusCode,
      message,
      path,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private extractMessage(exception: unknown, statusCode: number) {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return payload;
      }
      if (payload && typeof payload === 'object') {
        const message = (payload as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message;
        }
        if (typeof message === 'string') {
          return message;
        }
      }
    }

    if (statusCode >= 500) {
      return 'Internal server error';
    }

    if (exception instanceof Error && exception.message.length > 0) {
      return exception.message;
    }

    return 'Request failed';
  }
}
