import { BadRequestException } from '@nestjs/common';
import { DsaError, type DsaClient, type CatalogJob } from '../integration/dsa/dsa.client.js';
import type { InstrumentService } from './instrument.service.js';

export type CatalogProjection = {
  generation: number;
  checksum: string;
  count: number;
  cursor: string;
  idempotent?: boolean;
  incremental?: boolean;
  deletedCount?: number;
  acknowledged: boolean;
};
type CatalogStatus = Awaited<ReturnType<InstrumentService['latestGeneration']>>;

function assertJobCatalog(
  value: { generation: number; checksum: string; cursor: string },
  job: CatalogJob,
) {
  if (
    value.generation !== job.generation ||
    value.checksum !== job.checksum ||
    value.cursor !== `generation:${job.generation}`
  )
    throw new Error('目录投影与成功 Job 的 generation/checksum/cursor 不匹配');
}

async function acknowledgeCurrent(
  instruments: InstrumentService,
  dsa: DsaClient,
  status: CatalogStatus,
  job: CatalogJob,
): Promise<CatalogProjection | undefined> {
  if (status.generation !== job.generation || status.checksum !== job.checksum || !status.cursor)
    return undefined;
  assertJobCatalog(
    { generation: status.generation, checksum: status.checksum, cursor: status.cursor },
    job,
  );
  await dsa.acknowledgeCatalog(job.generation, job.checksum);
  const checked = await instruments.markCatalogChecked(job.generation, job.checksum);
  if (!checked.cursor || !checked.checksum) throw new Error('目录当前同步状态缺失');
  assertJobCatalog(
    { generation: checked.generation, checksum: checked.checksum, cursor: checked.cursor },
    job,
  );
  return {
    generation: checked.generation,
    checksum: checked.checksum,
    count: checked.instrumentCount,
    cursor: checked.cursor,
    idempotent: true,
    acknowledged: true,
  };
}

async function concurrentProjection(
  instruments: InstrumentService,
  dsa: DsaClient,
  job: CatalogJob,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const projection = await acknowledgeCurrent(
      instruments,
      dsa,
      await instruments.latestGeneration(),
      job,
    );
    if (projection) return projection;
    if (attempt < 4) await new Promise<void>((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  return undefined;
}

export async function projectCatalogJob(
  instruments: InstrumentService,
  dsa: DsaClient,
  job: CatalogJob,
): Promise<CatalogProjection> {
  if (job.status !== 'succeeded') throw new Error(`目录同步任务未成功: ${job.status}`);
  const status = await instruments.latestGeneration();
  if (status.generation > job.generation)
    throw new Error('本地目录 generation 高于 DSA 任务，拒绝倒退');
  const current = await acknowledgeCurrent(instruments, dsa, status, job);
  if (current) return current;
  try {
    let synced: Omit<CatalogProjection, 'acknowledged'>;
    const fullSnapshot = async () => {
      const snapshot = await dsa.catalogSnapshot();
      assertJobCatalog(snapshot, job);
      return instruments.syncCatalog(snapshot);
    };
    if (status.cursor) {
      try {
        const delta = await dsa.catalogDelta(status.cursor);
        assertJobCatalog(delta, job);
        synced = await instruments.applyCatalogDelta(delta);
      } catch (error) {
        const concurrent = await concurrentProjection(instruments, dsa, job);
        if (concurrent) return concurrent;
        if (!(
          error instanceof BadRequestException ||
          (error instanceof DsaError && error.status === 409)
        ))
          throw error;
        synced = await fullSnapshot();
      }
    } else synced = await fullSnapshot();
    assertJobCatalog(synced, job);
    await dsa.acknowledgeCatalog(synced.generation, synced.checksum);
    return { ...synced, acknowledged: true };
  } catch (error) {
    const concurrent = await concurrentProjection(instruments, dsa, job);
    if (concurrent) return concurrent;
    throw error;
  }
}
