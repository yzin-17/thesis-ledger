import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { AiController } from '../src/ai/ai.controller.js';
import { AutomationController } from '../src/automation/automation.controller.js';
import { JournalController } from '../src/journal/journal.controller.js';
import { NotificationController } from '../src/notifications/notification.controller.js';
import { ApiExceptionFilter } from '../src/platform/api-exception.filter.js';
import { DataQualityController } from '../src/quality/data-quality.controller.js';
import { LedgerController } from '../src/ledger/ledger.controller.js';

const malformed = (operation: () => unknown) => {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error('预期输入校验失败');
};

describe('HTTP runtime validation', () => {
  it('Journal malformed body is rejected before service execution', () => {
    const service = { createEntry: vi.fn() };
    const controller = new JournalController(service as never);

    expect(() => controller.createEntry({ reason: '' })).toThrow(z.ZodError);
    expect(service.createEntry).not.toHaveBeenCalled();
  });

  it('DataQuality malformed body is rejected before Prisma-facing service execution', () => {
    const service = { record: vi.fn(), validateStatus: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    const controller = new DataQualityController(service as never);

    expect(() => controller.record({ severity: 'error' })).toThrow(z.ZodError);
    expect(service.record).not.toHaveBeenCalled();
  });

  it('Automation enabled endpoint rejects string booleans', () => {
    const prisma = { automationJob: { update: vi.fn() } };
    const controller = new AutomationController({} as never, prisma as never, {} as never);

    expect(() => controller.setEnabled('job', { enabled: 'true' })).toThrow(z.ZodError);
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
  });

  it('AI start rejects missing provider/model before service execution', () => {
    const service = { start: vi.fn() };
    const controller = new AiController(service as never);

    expect(() => controller.start({ promptVersion: 'v1' })).toThrow(z.ZodError);
    expect(service.start).not.toHaveBeenCalled();
  });

  it('Notification manual delivery requires severity and traceId', () => {
    const service = { dispatchOne: vi.fn(), list: vi.fn() };
    const controller = new NotificationController(service as never);

    expect(() => controller.deliver('delivery', { title: 'x', body: 'y' })).toThrow(z.ZodError);
    expect(service.dispatchOne).not.toHaveBeenCalled();
  });

  it('global exception filter maps ZodError to HTTP 400', () => {
    const error = malformed(() => z.object({ name: z.string().min(1) }).parse({ name: 1 }));
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    };

    new ApiExceptionFilter().catch(error, host as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'validation_error', message: '输入不符合要求' }),
    );
  });

  it('Ledger 专用命令在进入服务前拒绝任意或 malformed body', () => {
    const commands = { createExecution: vi.fn() };
    const controller = new LedgerController(
      {} as never,
      commands as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() => controller.createExecution({ command: 'CREATE_EXECUTION' })).toThrow(z.ZodError);
    expect(commands.createExecution).not.toHaveBeenCalled();
  });

  it('Ledger 查询在 Controller 层拒绝非法 Revision，避免把字符串直接交给数据库', () => {
    const queries = { effectiveEvents: vi.fn() };
    const controller = new LedgerController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      queries as never,
    );

    expect(() =>
      controller.events('11111111-1111-4111-8111-111111111111', 'not-a-revision'),
    ).toThrow(z.ZodError);
    expect(queries.effectiveEvents).not.toHaveBeenCalled();
  });

  it('全局异常过滤器保留稳定 errorCode 并补齐通用 error 字段', () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };

    new ApiExceptionFilter().catch(
      new ConflictException({ errorCode: 'LEDGER_REVISION_CONFLICT', message: '请刷新' }),
      host as never,
    );

    expect(response.json).toHaveBeenCalledWith({
      errorCode: 'LEDGER_REVISION_CONFLICT',
      error: 'LEDGER_REVISION_CONFLICT',
      message: '请刷新',
    });
  });
});
