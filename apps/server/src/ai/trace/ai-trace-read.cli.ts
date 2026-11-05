import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AiTraceFileStore } from './ai-trace-file-store.js';

/** 仅从受信任的本地私有目录读取，不连接数据库、Provider 或模型。 */
export async function readAiTraceCli(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      trace: { type: 'string' },
      run: { type: 'string' },
      owner: { type: 'string' },
      attempt: { type: 'string' },
      node: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const found = await new AiTraceFileStore(values.root).read(
    { version: 'ai-execution-trace-v1', traceId: values.trace ?? '' },
    {
      runId: values.run ?? '',
      ownerId: values.owner ?? '',
      executionAttempt: Number(values.attempt),
    },
  );
  if (!values.node)
    return {
      directory: found.directory,
      manifest: found.manifest,
      artifacts: Object.entries(found.artifacts).map(([file, value]) => ({
        file,
        path: value.path,
      })),
    };
  const node = found.manifest.nodes.find((candidate) => candidate.id === values.node);
  if (!node) throw new Error('trace 节点不存在');
  return {
    node,
    artifacts: Object.fromEntries(
      Object.entries(found.artifacts).filter(([file]) => file.startsWith(node.id + '-')),
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  readAiTraceCli(process.argv.slice(2))
    .then((value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n'))
    .catch(() => {
      process.stderr.write('trace 读取失败，请检查身份、路径、大小和完整性；未连接模型。\n');
      process.exitCode = 1;
    });
}
