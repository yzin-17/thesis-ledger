import type { AiGenerationRuntimeDiagnostic } from '@thesis-ledger/schemas';
import {
  httpResponseError,
  httpResponseErrorValue,
  parseHttpResponseJson,
} from './ai-generation-http-response-error.js';

type Diagnostic = NonNullable<AiGenerationRuntimeDiagnostic['httpResponse']>;
const limit = 8192;
const contentType = (value: string | null): Diagnostic['contentType'] => {
  if (!value) return 'missing';
  const mime = value.split(';')[0]?.trim().toLowerCase();
  if (mime === 'text/event-stream') return 'sse';
  if (mime === 'application/json' || mime?.endsWith('+json')) return 'json';
  if (mime === 'text/html') return 'html';
  if (mime?.startsWith('text/')) return 'text';
  return 'other';
};

/** 同步旁观 SDK 正在读取的字节；不 clone、不预读，也不保存完整响应。 */
export class AiGenerationHttpResponseDiagnostics {
  private responses = 0;
  private first: Diagnostic | undefined;
  private readonly decoder = new TextDecoder();
  private body = '';
  private line = '';
  private previousCr = false;
  private data = '';
  private hasData = false;
  private errorEvent = false;
  private oversized = false;

  observe(response: Response): Response {
    this.responses += 1;
    if (this.first) return response;
    this.first = {
      version: 'ai-http-response-diagnostic-v1',
      boundary: 'fetch_response',
      responses: 1,
      omittedResponses: 0,
      status: response.status,
      contentType: contentType(response.headers.get('content-type')),
      bodyBytes: 0,
      bodyComplete: response.body === null,
      bodyTruncated: false,
      bodyJson: null,
      sse: null,
      error: null,
    };
    if (this.first.contentType === 'sse')
      this.first.sse = {
        events: 0,
        invalidJsonEvents: 0,
        oversizeEvents: 0,
        done: false,
        incompleteEvent: false,
      };
    if (!response.body) return response;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          controller.enqueue(chunk);
          this.safely(() => this.chunk(chunk));
        },
        flush: () => this.safely(() => this.complete()),
      }),
    );
    return new Response(body, response);
  }

  snapshot(): Diagnostic | undefined {
    if (!this.first) return undefined;
    return {
      ...this.first,
      bodyTruncated: this.first.bodyTruncated || this.oversized,
      responses: this.responses,
      omittedResponses: this.responses - 1,
      sse: this.first.sse
        ? { ...this.first.sse, incompleteEvent: this.hasData || this.line.length > 0 }
        : null,
    };
  }

  private safely(observe: () => void) {
    try {
      observe();
    } catch {
      if (this.first) this.first.bodyTruncated = true;
    }
  }

  private chunk(chunk: Uint8Array) {
    if (!this.first) return;
    this.first.bodyBytes = Math.min(Number.MAX_SAFE_INTEGER, this.first.bodyBytes + chunk.length);
    for (let offset = 0; offset < chunk.length; offset += 4096)
      this.text(this.decoder.decode(chunk.subarray(offset, offset + 4096), { stream: true }));
  }

  private text(text: string) {
    if (!this.first) return;
    if (this.first.sse) {
      for (const character of text) this.character(character);
      return;
    }
    if (this.body.length + text.length > limit) this.first.bodyTruncated = true;
    this.body = (this.body + text).slice(0, limit);
  }

  private character(character: string) {
    if (character === '\n' && this.previousCr) {
      this.previousCr = false;
      return;
    }
    this.previousCr = character === '\r';
    if (character === '\r' || character === '\n') {
      this.consumeLine();
      this.line = '';
    } else if (this.line.length < limit) this.line += character;
    else this.oversized = true;
  }

  private consumeLine() {
    if (this.line === '') {
      this.consumeEvent();
      return;
    }
    if (this.line.startsWith('event:')) this.errorEvent = this.line.slice(6).trim() === 'error';
    if (!this.line.startsWith('data:')) return;
    const data = this.line.slice(5).replace(/^ /u, '');
    const joined = this.hasData ? `${this.data}\n${data}` : data;
    if (joined.length > limit) this.oversized = true;
    this.data = joined.slice(0, limit);
    this.hasData = true;
  }

  private consumeEvent() {
    const first = this.first;
    const sse = first?.sse;
    if (!first || !sse) return;
    if (this.hasData || this.errorEvent) {
      sse.events += 1;
      if (this.oversized) {
        sse.oversizeEvents += 1;
        first.bodyTruncated = true;
      } else this.inspectEvent();
    }
    this.data = '';
    this.hasData = false;
    this.errorEvent = false;
    this.oversized = false;
  }

  private inspectEvent() {
    if (!this.first?.sse) return;
    if (this.data.trim() === '[DONE]') {
      this.first.sse.done = true;
      return;
    }
    const parsed = parseHttpResponseJson(this.data);
    if (!parsed.valid) this.first.sse.invalidJsonEvents += 1;
    const error = httpResponseErrorValue(parsed.value);
    if (error !== undefined || this.errorEvent)
      this.first.error ??= httpResponseError(
        this.data,
        error ?? parsed.value ?? this.data,
        'sse_error',
      );
  }

  private complete() {
    if (!this.first) return;
    this.text(this.decoder.decode());
    this.first.bodyComplete = true;
    if (this.first.sse) return;
    if (this.first.bodyTruncated) {
      this.first.bodyJson = 'oversize';
      return;
    }
    const parsed = parseHttpResponseJson(this.body);
    this.first.bodyJson = parsed.valid ? 'valid' : 'invalid';
    const error = httpResponseErrorValue(parsed.value);
    if (this.first.status >= 400 || error !== undefined)
      this.first.error = httpResponseError(
        this.body,
        error ?? parsed.value ?? this.body,
        'http_body',
      );
    this.body = '';
  }
}
