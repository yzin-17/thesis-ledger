import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';

const traceStorage = new AsyncLocalStorage<string>();
const sensitiveKey =
  /(authorization|cookie|password|secret|token|webhook|api[-_]?key|credential)/iu;

export const runWithTrace = <T>(traceId: string, callback: () => T) =>
  traceStorage.run(traceId, callback);

export const currentTraceId = () => traceStorage.getStore();

export const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redactSecrets(entry),
      ]),
    );
  }
  return value;
};

export interface StructuredLogRecord {
  operation: string;
  service?: string;
  traceId?: string;
  durationMs?: number;
  status?: string | number;
  [key: string]: unknown;
}

export const renderStructuredLog = (record: StructuredLogRecord) =>
  JSON.stringify(
    redactSecrets({
      timestamp: new Date().toISOString(),
      service: 'investment-os-server',
      traceId: currentTraceId() ?? 'unknown',
      ...record,
    }),
  );

export class StructuredLogger {
  private readonly logger: Logger;

  constructor(context = 'investment-os') {
    this.logger = new Logger(context);
  }

  log(record: StructuredLogRecord) {
    this.logger.log(renderStructuredLog(record));
  }

  warn(record: StructuredLogRecord) {
    this.logger.warn(renderStructuredLog(record));
  }

  error(record: StructuredLogRecord) {
    this.logger.error(renderStructuredLog(record));
  }
}
