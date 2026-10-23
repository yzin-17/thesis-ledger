import { createHash, randomUUID } from 'node:crypto';
import { NoObjectGeneratedError, NoOutputGeneratedError } from 'ai';
import { aiGenerationContracts, researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import {
  generationFailureDiagnostic,
  schemaGenerationFailure,
} from '../../src/ai/ai-generation-failure-diagnostics.js';

const objectError = (text: string | undefined, modelId = 'fixture/model:free') =>
  new NoObjectGeneratedError({
    message: 'No object generated: PRIVATE_RESPONSE sk-private-token',
    ...(text === undefined ? {} : { text }),
    response: { id: 'fixture', timestamp: new Date(0), modelId },
    usage: {
      inputTokens: 1,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens: 2,
      outputTokenDetails: { textTokens: 2, reasoningTokens: 0 },
      totalTokens: 3,
    },
    finishReason: 'stop',
  });

describe('G3 失败响应脱敏诊断', () => {
  it('保留 JSON 形状、长度和摘要，遮蔽字段名、内容、数字与凭据', () => {
    const text = JSON.stringify({
      secretField: 'PRIVATE_RESPONSE Bearer private-token sk-private-token',
      balance: 987654321,
      nested: ['私人持仓', true, null],
      escaped: 'quote " and slash \\ and tail PRIVATE_RESPONSE',
    });
    const diagnostic = generationFailureDiagnostic(objectError(text), 'native_schema');
    expect(diagnostic).toMatchObject({
      version: 'ai-failure-diagnostic-v1',
      errorClass: 'no_object',
      generationMode: 'native_schema',
      finishReason: 'stop',
      actualModel: 'fixture/model:free',
      outputCharacters: text.length,
      outputSha256: createHash('sha256').update(text).digest('hex'),
      jsonStatus: 'valid',
      jsonRootType: 'object',
      truncated: false,
    });
    expect(diagnostic.structuralPreview).toBe(
      '{"[text]":"[text]","[text]":[value],"[text]":["[text]",[value],[value]],"[text]":"[text]"}',
    );
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /PRIVATE_RESPONSE|private-token|secretField|987654321|私人持仓/u,
    );
  });

  it.each([
    ['[]', 'array'],
    ['"private"', 'string'],
    ['123', 'number'],
    ['false', 'boolean'],
    ['null', 'null'],
  ])('识别合法 JSON 根类型 %s', (text, root) => {
    expect(generationFailureDiagnostic(objectError(text), 'native_schema')).toMatchObject({
      jsonStatus: 'valid',
      jsonRootType: root,
    });
  });

  it('区分 SDK 未留存文本、空文本与无效 JSON', () => {
    expect(generationFailureDiagnostic(objectError(undefined), 'native_schema')).toMatchObject({
      outputCharacters: null,
      outputSha256: null,
      jsonStatus: 'missing',
      structuralPreview: null,
    });
    expect(generationFailureDiagnostic(objectError(' \n'), 'native_schema')).toMatchObject({
      outputCharacters: 2,
      jsonStatus: 'empty',
      structuralPreview: ' \n',
    });
    expect(
      generationFailureDiagnostic(
        objectError('```json\n{"private":"unterminated'),
        'native_schema',
      ),
    ).toMatchObject({ jsonStatus: 'invalid', structuralPreview: '```[value]\n{"[text]":"[text]' });
  });

  it('限制扫描和预览长度，超大响应不做 JSON 解析', () => {
    const text = '[1,'.repeat(30_000);
    const diagnostic = generationFailureDiagnostic(objectError(text), 'native_schema');
    expect(diagnostic).toMatchObject({
      jsonStatus: 'not_checked_oversize',
      outputCharacters: text.length,
      truncated: true,
    });
    expect(diagnostic.structuralPreview).toHaveLength(2048);
    expect(diagnostic.outputSha256).toBe(createHash('sha256').update(text).digest('hex'));
    expect(
      generationFailureDiagnostic(objectError('"' + 'x'.repeat(5000)), 'native_schema'),
    ).toMatchObject({ truncated: true, structuralPreview: '"[text]' });
  });

  it('只从有限层级的 SDK 错误读取文本，不探查任意正文、请求头或 Prompt', () => {
    const source = objectError('{}');
    const wrapped = new Error('wrapper', { cause: new Error('wrapper', { cause: source }) });
    expect(generationFailureDiagnostic(wrapped, 'native_schema').jsonStatus).toBe('valid');
    expect(
      generationFailureDiagnostic(new Error('too deep', { cause: wrapped }), 'native_schema')
        .jsonStatus,
    ).toBe('missing');
    const arbitrary = {
      cause: null,
      get text() {
        throw new Error('不应读取任意 text');
      },
      get body() {
        throw new Error('不应读取 body');
      },
      get headers() {
        throw new Error('不应读取 headers');
      },
      get messages() {
        throw new Error('不应读取 messages');
      },
    };
    expect(generationFailureDiagnostic(arbitrary, 'json_validated').jsonStatus).toBe('missing');
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(generationFailureDiagnostic(cyclic, 'native_schema').jsonStatus).toBe('missing');
  });

  it.each(['sk-private-token', 'Bearer-private', 'api_key-secret', 'model\nprivate'])(
    '拒绝不安全的模型标识 %s',
    (model) => {
      expect(
        generationFailureDiagnostic(objectError('{}', model), 'native_schema').actualModel,
      ).toBeNull();
    },
  );

  it('仅为 research V2 增补诊断，原合同与计量不变', () => {
    const error = objectError('{');
    const usage = { status: 'reported' as const, inputTokens: 1, outputTokens: 2 };
    const requestId = randomUUID();
    const failure = schemaGenerationFailure(
      error,
      {
        requestId,
        contract: researchGenerationV2Contract.ref,
        mode: 'native_schema',
      },
      usage,
    );
    expect(failure.fact).toMatchObject({
      code: 'schema_invalid',
      phase: 'validation',
      externalResult: 'complete',
      requestId,
      summary: '结构化响应未通过解析或契约校验',
      diagnostic: { jsonStatus: 'invalid' },
    });
    expect(failure.usage).toEqual(usage);
    expect(failure.cause).toBe(error);
    const legacy = schemaGenerationFailure(
      error,
      {
        requestId,
        contract: aiGenerationContracts.research.ref,
        mode: 'native_schema',
      },
      usage,
    );
    expect(legacy.fact).not.toHaveProperty('diagnostic');
  });

  it('错误文本未留存时仍能标记错误类别', () => {
    expect(generationFailureDiagnostic(new SyntaxError('private'), 'json_validated')).toMatchObject(
      { errorClass: 'syntax', jsonStatus: 'missing' },
    );
    expect(
      generationFailureDiagnostic(new NoOutputGeneratedError(), 'native_schema'),
    ).toMatchObject({ errorClass: 'no_output', jsonStatus: 'missing' });
    const schemaError = new Error('private');
    schemaError.name = 'ZodError';
    expect(generationFailureDiagnostic(schemaError, 'native_schema').errorClass).toBe('schema');
  });
});
