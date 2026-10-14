import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { loadConfig } from './platform/config.js';
import { ApiExceptionFilter } from './platform/api-exception.filter.js';
import { runWithTrace, StructuredLogger } from './platform/structured-logger.js';
import type { NextFunction, Request, Response } from 'express';
import { createApiRateLimitMiddleware } from './platform/api-rate-limit.js';
import { ErrorTrackingService } from './platform/error-tracking.service.js';
import { backtestResearchBodyParserOptions } from './backtest/backtest-research-body-parser.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  createLanAuthMiddleware,
  resolveServerNetworkSecurity,
} from './platform/network-security.js';

const bootstrap = async () => {
  const config = loadConfig();
  const network = resolveServerNetworkSecurity();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  app.enableCors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : false });
  app.use(createApiRateLimitMiddleware());
  if (network.mode === 'lan') app.use(createLanAuthMiddleware(network.apiToken!));
  const requestLogger = new StructuredLogger('thesis-ledger.http');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const traceId = request.header('x-trace-id') ?? crypto.randomUUID();
    response.setHeader('x-trace-id', traceId);
    runWithTrace(traceId, () => {
      const started = Date.now();
      response.on('finish', () =>
        requestLogger.log({
          operation: 'http.request',
          traceId,
          status: response.statusCode,
          durationMs: Date.now() - started,
          method: request.method,
          path: request.path,
        }),
      );
      next();
    });
  });
  app.useBodyParser('json', backtestResearchBodyParserOptions());
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalFilters(new ApiExceptionFilter(app.get(ErrorTrackingService)));
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'api/market/(.*)', method: RequestMethod.ALL },
      { path: 'api/market-data/(.*)', method: RequestMethod.ALL },
    ],
  });
  await app.listen(config.port, network.host);
};

void bootstrap();
