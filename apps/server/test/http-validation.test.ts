import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AiController } from '../src/ai/ai.controller.js';
import { AutomationController } from '../src/automation/automation.controller.js';
import { JournalController } from '../src/journal/journal.controller.js';
import { NotificationController } from '../src/notifications/notification.controller.js';
import { ApiExceptionFilter } from '../src/platform/api-exception.filter.js';
import { DataQualityController } from '../src/quality/data-quality.controller.js';

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
});
