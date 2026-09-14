import { PrismaService } from '../platform/prisma.service.js';

export type WorkerDatabaseProbe = Pick<PrismaService, 'onModuleInit' | 'onModuleDestroy'>;

export const assertBacktestWorkerDatabaseReady = async (
  createProbe: () => WorkerDatabaseProbe = () => new PrismaService(),
) => {
  const probe = createProbe();
  try {
    await probe.onModuleInit();
  } finally {
    await probe.onModuleDestroy();
  }
};
