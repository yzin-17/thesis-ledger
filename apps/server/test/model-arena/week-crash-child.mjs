import { mock } from 'node:test';
import { fixtureDatabase } from './journey-fixture.mjs';
import { RedisService } from '../../dist/src/platform/redis.service.js';
import { ArenaWeekWorker } from '../../dist/src/model-arena/arena-week-worker.js';
import { ArenaWeekStore } from '../../dist/src/model-arena/arena-week-store.js';
import { ArenaWeekProjector } from '../../dist/src/model-arena/arena-week-project.js';
import { ArenaComparisons } from '../../dist/src/model-arena/arena-comparison.js';

if (!process.send) throw Error('缺少验收父进程');
process.once('disconnect', () => process.exit(0));
const db = fixtureDatabase();
mock.timers.enable({ apis: ['Date'], now: Date.parse(process.argv[2]) });
const projector = new ArenaWeekProjector(db, new ArenaComparisons(db));
const build = projector.build.bind(projector);
projector.build = async (job, ...args) => {
  const report = await build(job, ...args);
  if (job.arenaId === process.argv[3]) {
    process.send({ id: job.id, attempt: job.attempt });
    // 报告已算出、发布事务尚未开始。父进程将从外部终止本进程。
    await new Promise(() => {});
  }
  return report;
};
new ArenaWeekWorker(db, new RedisService(), new ArenaWeekStore(db, projector)).start();
