import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { currentTraceId, StructuredLogger } from './structured-logger.js';
import { ErrorTrackingService } from './error-tracking.service.js';
import { DsaError } from '../market/dsa-client.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new StructuredLogger('thesis-ledger.errors');

  constructor(private readonly tracker?: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ZodError) {
      this.logger.warn({
        operation: 'http.validation_error',
        traceId: currentTraceId() ?? 'unknown',
        status: HttpStatus.BAD_REQUEST,
        fields: exception.issues.map((issue) => issue.path.join('.')),
      });
      void this.tracker?.capture({
        operation: 'http.validation_error',
        errorCode: 'validation_error',
        traceId: currentTraceId() ?? 'unknown',
        status: HttpStatus.BAD_REQUEST,
      });
      response.status(HttpStatus.BAD_REQUEST).json({
        error: 'validation_error',
        message: '输入不符合要求',
        fields: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    if (exception instanceof DsaError) {
      this.logger.warn({
        operation: 'dsa.contract_error',
        traceId: currentTraceId() ?? 'unknown',
        status: exception.status ?? HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: exception.code,
      });
      response.status(exception.status ?? HttpStatus.SERVICE_UNAVAILABLE).json({
        error: exception.code,
        message: exception.message,
      });
      return;
    }
    if (exception instanceof HttpException) {
      this.logger.warn({
        operation: 'http.exception',
        traceId: currentTraceId() ?? 'unknown',
        status: exception.getStatus(),
      });
      void this.tracker?.capture({
        operation: 'http.exception',
        errorCode: 'http_exception',
        traceId: currentTraceId() ?? 'unknown',
        status: exception.getStatus(),
      });
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    this.logger.error({
      operation: 'http.unhandled_exception',
      traceId: currentTraceId() ?? 'unknown',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    void this.tracker?.capture({
      operation: 'http.unhandled_exception',
      errorCode: 'internal_error',
      traceId: currentTraceId() ?? 'unknown',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: 'internal_error', message: '服务暂时不可用' });
  }
}
