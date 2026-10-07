import { NestFactory } from '@nestjs/core';
import type { INestApplication, Type } from '@nestjs/common';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { BacktestService } from '../../src/backtest/backtest.service.js';

/** 复用实际编译 Controller 和装饰器元数据，仅注入隔离环境服务。 */
export async function startWorkerHttpFixture(service: BacktestService): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  const path = pathToFileURL(resolve('dist/src/backtest/backtest.controller.js')).href;
  const { BacktestController } = (await import(path)) as { BacktestController: Type<unknown> };
  const [serviceToken, eventsToken] = Reflect.getMetadata('design:paramtypes', BacktestController);
  class WorkerHttpFixtureModule {}
  const app = await NestFactory.create(
    {
      module: WorkerHttpFixtureModule,
      controllers: [BacktestController],
      providers: [
        { provide: serviceToken, useValue: service },
        { provide: eventsToken, useValue: {} },
      ],
    },
    { logger: false },
  );
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  return { app, baseUrl: await app.getUrl() };
}
