import { Injectable } from '@nestjs/common';
import { redactSecrets } from './structured-logger.js';

export interface TrackedError {
  operation: string;
  errorCode: string;
  traceId: string;
  status?: number;
}

@Injectable()
export class ErrorTrackingService {
  async capture(input: TrackedError) {
    const endpoint = process.env.ERROR_TRACKING_URL?.trim();
    if (!endpoint) return { sent: false, reason: 'disabled' as const };
    const payload = redactSecrets({
      event: 'investment-os.error',
      release: process.env.APP_VERSION ?? 'dev',
      environment: process.env.NODE_ENV ?? 'development',
      ...input,
    });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { sent: response.ok, status: response.status };
    } catch {
      return { sent: false, reason: 'transport_error' as const };
    }
  }
}
