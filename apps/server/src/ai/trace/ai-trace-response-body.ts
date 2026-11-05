import { createHash } from 'node:crypto';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** 在转交 SDK 前同步观察字节；有界保留副本，原流不改写、不额外读取。 */
export class AiTraceResponseBody {
  private readonly digest = createHash('sha256');
  private readonly chunks: Uint8Array[] = [];
  private bytes = 0;
  private retained = 0;
  constructor(
    private readonly contentType: string,
    private readonly limit = 2 * 1024 * 1024,
  ) {}

  observe(chunk: Uint8Array) {
    this.digest.update(chunk);
    this.bytes += chunk.byteLength;
    const available = this.limit - this.retained;
    if (available > 0) {
      const copy = chunk.slice(0, available);
      this.chunks.push(copy);
      this.retained += copy.byteLength;
    }
  }

  finish() {
    const text = Buffer.concat(this.chunks).toString('utf8');
    const truncated = this.bytes > this.retained;
    const raw = { bytes: this.bytes, sha256: this.digest.digest('hex'), truncated };
    const payloads: unknown[] = [];
    let invalidJson = 0;
    let done = false;
    if (this.contentType.includes('text/event-stream')) {
      for (const frame of text.replace(/\r\n/g, '\n').split('\n\n')) {
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        if (data.trim() === '[DONE]') {
          done = true;
          continue;
        }
        try {
          payloads.push(JSON.parse(data) as unknown);
        } catch {
          invalidJson++;
        }
      }
    } else if (text) {
      try {
        payloads.push(JSON.parse(text) as unknown);
      } catch {
        invalidJson++;
      }
    }
    let content = '';
    const upstreamErrors: unknown[] = [];
    const models = new Set<string>();
    const generationIds = new Set<string>();
    for (const payload of payloads) {
      const value = record(payload);
      if (!value) continue;
      if (value.error) upstreamErrors.push(value.error);
      if (typeof value.model === 'string') models.add(value.model);
      if (typeof value.id === 'string') generationIds.add(value.id);
      if (Array.isArray(value.choices)) {
        for (const choice of value.choices) {
          const entry = record(choice);
          const message = record(entry?.delta) ?? record(entry?.message);
          if (typeof message?.content === 'string') content += message.content;
          if (entry?.error) upstreamErrors.push(entry.error);
        }
      }
      // OpenAI Responses 与 Anthropic 的文本增量；reasoning 增量不会进入正文。
      if (value.type === 'response.output_text.delta' && typeof value.delta === 'string')
        content += value.delta;
      const delta = record(value.delta);
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') content += delta.text;
      if (Array.isArray(value.content)) {
        for (const part of value.content) {
          const block = record(part);
          if (block?.type === 'text' && typeof block.text === 'string') content += block.text;
        }
      }
    }
    // 无法解析的正文保留类型、大小与摘要，避免把未知 reasoning 或 HTML 凭据写入文件。
    return {
      raw,
      content,
      body: {
        format: this.contentType.includes('text/event-stream') ? 'sse' : 'json',
        payloads,
        invalidJson,
        done,
      },
      facts: {
        invalidJson,
        done,
        models: [...models],
        generationIds: [...generationIds],
        upstreamErrors,
      },
    };
  }
}
