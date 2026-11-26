import { LocalArtifactStore } from '../../src/backtest/backtest-artifact-store.js';
import processBacktest from '../../src/backtest/backtest.processor.js';

const put = LocalArtifactStore.prototype.put;
// 独立 Worker 先运行真实写入，再阻塞后续文件，等测试进程终止它。
LocalArtifactStore.prototype.put = async function (input) {
  const artifact = await put.call(this, input);
  console.log(JSON.stringify({ event: 'snapshot-first-artifact-written', key: artifact.key }));
  return new Promise<never>(() => {});
};

export default processBacktest;
