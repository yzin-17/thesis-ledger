import { createHash } from 'node:crypto';
import { NoObjectGeneratedError } from 'ai';
import { describe, expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { liveCallFailureDiagnostics } from '../../src/model-arena/live/live-call-diagnostics.js';

const error = (text?: string) => new Error('SDK failure', { cause: new NoObjectGeneratedError({
  message: '结构化响应未通过校验', ...(text === undefined ? {} : { text }),
  response: { id: 'fixture', timestamp: new Date(0), modelId: 'fixture' },
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3,
    inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokenDetails: { textTokens: 2, reasoningTokens: 0 } },
  finishReason: 'stop',
}) });
const capture = (text?: string) => liveCallFailureDiagnostics(error(text), aiGenerationContracts.arenaLiveResearch.schema, 'private-api-key');

describe('自主研究失败输出诊断', () => {
  it('保留独立复现所需的输出与准确违规路径', () => {
    const text = JSON.stringify({ action: 'decision', decision: {
      summary: '观察', orders: [], cancelOrderIds: [], watchedSymbols: [], wakeups: [],
    } });
    expect(capture(text)).toMatchObject({ outputText: text, outputCharacters: text.length,
      outputSha256: createHash('sha256').update(text).digest('hex'), truncated: false,
      contractCheck: { jsonStatus: 'valid', schemaAccepted: false,
        issues: [{ code: 'too_small', path: ['decision', 'wakeups'] }] } });
  });
  it('独立校验区分合规输出、无效 JSON 和没有原文', () => {
    expect(capture('{')).toMatchObject({ contractCheck: { jsonStatus: 'invalid', schemaAccepted: false } });
    expect(capture()).toMatchObject({ outputText: null, outputSha256: null, contractCheck: { status: 'missing' } });
    expect(capture(JSON.stringify({ action: 'tools', requests: [{ name: 'quote', symbol: 'AAPL.US' }] })))
      .toMatchObject({ contractCheck: { schemaAccepted: true, issueCount: 0 } });
  });
  it('脱敏密钥和思考字段，限制保存长度且保留完整摘要', () => {
    const text = JSON.stringify({ password: 'secret', summary: 'private-api-key', reasoning: '隐藏思考' });
    const saved = capture(text);
    expect(saved.outputText).not.toMatch(/private-api-key|secret|隐藏思考/u);
    expect(saved.outputText).toContain('[REDACTED]');
    const long = 'x'.repeat(70_000);
    expect(capture(long)).toMatchObject({ outputCharacters: 70_000, truncated: true,
      outputSha256: createHash('sha256').update(long).digest('hex') });
    expect(capture(long).outputText).toHaveLength(65_536);
  });
});
