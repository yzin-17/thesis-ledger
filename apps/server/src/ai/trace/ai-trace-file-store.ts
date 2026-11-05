import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  AiTraceUnavailableError,
  aiTraceReferenceSchema,
  type AiTraceArtifact,
  type AiTraceManifest,
  type AiTraceReference,
} from './ai-trace-contract.js';
import { redactAiTrace } from './ai-trace-redaction.js';

export type AiTraceIdentity = {
  runId: string;
  ownerId: string;
  executionAttempt: number;
};
export type AiTraceFileLabel =
  'input' | 'output' | 'request-body' | 'response-body' | 'assistant-content';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const artifactName =
  /^[0-9a-f-]{36}-(?:input|output|request-body|response-body|assistant-content)\.(?:json|txt)$/u;
const identitySchema = z.object({
  runId: z.uuid(),
  ownerId: z.uuid(),
  executionAttempt: z.number().int().positive(),
});
const stringify = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2) ?? 'null';

export const defaultAiTraceRoot = () =>
  resolve(
    process.env.BACKTEST_SNAPSHOT_ROOT?.trim() || resolve(process.cwd(), 'var/backtest'),
    'ai-traces',
  );

export class AiTraceFileStore {
  readonly maxArtifactBytes: number;
  readonly maxTotalBytes: number;
  constructor(
    readonly root = defaultAiTraceRoot(),
    limits: { maxArtifactBytes?: number; maxTotalBytes?: number } = {},
  ) {
    this.maxArtifactBytes = limits.maxArtifactBytes ?? 2 * 1024 * 1024;
    this.maxTotalBytes = limits.maxTotalBytes ?? 8 * 1024 * 1024;
  }

  private directory(reference: AiTraceReference, identity: AiTraceIdentity) {
    aiTraceReferenceSchema.parse(reference);
    identitySchema.parse(identity);
    return join(
      resolve(this.root),
      reference.traceId,
      identity.runId,
      `attempt-${identity.executionAttempt}`,
    );
  }

  async open(reference: AiTraceReference, identity: AiTraceIdentity) {
    const directory = this.directory(reference, identity);
    await mkdir(resolve(this.root), { recursive: true, mode: 0o700 });
    const root = await realpath(this.root);
    for (const part of [
      join(this.root, reference.traceId),
      join(this.root, reference.traceId, identity.runId),
    ]) {
      try {
        await mkdir(part, { mode: 0o700 });
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
          throw error;
      }
      if (!(await lstat(part)).isDirectory() || !(await realpath(part)).startsWith(root + sep))
        throw new AiTraceUnavailableError('invalid_directory');
    }
    await mkdir(directory, { mode: 0o700 });
    return new AiTraceFiles(directory, this.maxArtifactBytes, this.maxTotalBytes);
  }

  async read(reference: AiTraceReference, identity: AiTraceIdentity) {
    const directory = await realpath(this.directory(reference, identity));
    const root = await realpath(this.root);
    if (!directory.startsWith(root + sep)) throw new AiTraceUnavailableError('invalid_directory');
    const manifestPath = await realpath(join(directory, 'trace.json'));
    if (!manifestPath.startsWith(directory + sep))
      throw new AiTraceUnavailableError('invalid_manifest');
    if ((await stat(manifestPath)).size > 128 * 1024)
      throw new AiTraceUnavailableError('manifest_limit');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AiTraceManifest;
    if (
      manifest.version !== reference.version ||
      manifest.traceId !== reference.traceId ||
      manifest.runId !== identity.runId ||
      manifest.ownerId !== identity.ownerId ||
      manifest.executionAttempt !== identity.executionAttempt ||
      !Array.isArray(manifest.artifacts)
    ) {
      throw new AiTraceUnavailableError('identity_mismatch');
    }
    const artifacts: Record<string, { path: string; value: unknown }> = {};
    if (manifest.artifacts.length > 192) throw new AiTraceUnavailableError('artifact_count_limit');
    let totalBytes = 0;
    for (const ref of manifest.artifacts) {
      if (!artifactName.test(ref.file)) throw new AiTraceUnavailableError('invalid_artifact');
      const path = await realpath(join(directory, ref.file));
      if (!path.startsWith(directory + sep) || (await stat(path)).size > this.maxArtifactBytes)
        throw new AiTraceUnavailableError('artifact_limit');
      const text = await readFile(path, 'utf8');
      totalBytes += Buffer.byteLength(text);
      if (totalBytes > this.maxTotalBytes) throw new AiTraceUnavailableError('total_limit');
      if (Buffer.byteLength(text) !== ref.bytes || hash(text) !== ref.sha256)
        throw new AiTraceUnavailableError('artifact_integrity');
      artifacts[ref.file] = {
        path,
        value: ref.file.endsWith('.json') ? (JSON.parse(text) as unknown) : text,
      };
    }
    // 运行中或进程中断留下的 manifest 均不能作为完整取证；只调整反读视图，不回写文件。
    if (manifest.completedAt === null) {
      manifest.captureStatus = 'incomplete';
      manifest.issues = [...manifest.issues, 'trace_not_finalized'];
    }
    return { directory, manifest, artifacts };
  }
}

export class AiTraceFiles {
  private usedBytes = 0;
  constructor(
    readonly directory: string,
    readonly maxArtifactBytes: number,
    readonly maxTotalBytes: number,
  ) {}

  async writeArtifact(
    nodeId: string,
    label: AiTraceFileLabel,
    value: unknown,
    secrets: ReadonlySet<string>,
    text = false,
  ): Promise<AiTraceArtifact> {
    const original = text ? String(value) : stringify(value);
    const redacted = redactAiTrace(value, secrets);
    const saved = text ? String(redacted) : stringify(redacted);
    const bytes = Buffer.byteLength(saved);
    if (bytes > this.maxArtifactBytes || this.usedBytes + bytes > this.maxTotalBytes)
      throw new AiTraceUnavailableError('artifact_limit');
    const file = `${nodeId}-${label}.${text ? 'txt' : 'json'}`;
    if (!artifactName.test(file)) throw new AiTraceUnavailableError('invalid_artifact');
    // 先预留预算，防止并行节点共同越过单 trace 上限。
    this.usedBytes += bytes;
    await writeFile(join(this.directory, file), saved, { flag: 'wx', mode: 0o600 });
    return {
      file,
      bytes,
      sha256: hash(saved),
      originalBytes: Buffer.byteLength(original),
      originalSha256: hash(original),
      redacted: original !== saved,
    };
  }

  async writeManifest(manifest: AiTraceManifest) {
    const text = stringify(manifest);
    if (Buffer.byteLength(text) > 128 * 1024) throw new AiTraceUnavailableError('manifest_limit');
    const temporary = join(this.directory, `.trace-${randomUUID()}.tmp`);
    await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(this.directory, 'trace.json'));
  }
}
