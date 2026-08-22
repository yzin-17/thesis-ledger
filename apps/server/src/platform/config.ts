import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  DSA_BASE_URL: z.url(),
  DSA_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PROVIDER_HEALTH_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  THESIS_LEDGER_DSA_TOKEN: z.string().min(1),
  THESIS_LEDGER_CONTROL_TOKEN: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().default(''),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(16),
  ERROR_TRACKING_URL: z.url().optional().or(z.literal('')),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export const parseConfig = (environment: Record<string, string | undefined>) => {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`环境变量无效或缺失: ${fields}`);
  }
  return {
    environment: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    dsaBaseUrl: parsed.data.DSA_BASE_URL,
    dsaTimeoutMs: parsed.data.DSA_TIMEOUT_MS,
    providerHealthCheckIntervalMs: parsed.data.PROVIDER_HEALTH_CHECK_INTERVAL_MS,
    dsaToken: parsed.data.THESIS_LEDGER_DSA_TOKEN,
    controlToken: parsed.data.THESIS_LEDGER_CONTROL_TOKEN || undefined,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    errorTrackingUrl: parsed.data.ERROR_TRACKING_URL || undefined,
  };
};

export const loadConfig = () => parseConfig(process.env);
