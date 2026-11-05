import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const namedModel = 'nvidia/nemotron-3.5-super-vl:free';
const canonicalModel = 'nvidia/nemotron-3.5-super-vl-20261015';
const schema = {
  type: 'object',
  properties: { ok: { type: 'boolean', const: true } },
  required: ['ok'],
  additionalProperties: false,
};
const models = [
  namedModel,
  namedModel.replace(/:free$/, ''),
  canonicalModel,
  canonicalModel + ':free',
];

export function validateFreeProbeResponse(value, sealed, reference, directory, baseBytes) {
  if (value.requestedModel === 'openrouter/free') {
    if (
      sealed.body?.model !== 'openrouter/free' ||
      value.response?.exactOK !== true ||
      value.actualModelCatalogZeroPrice !== true
    )
      throw new Error('免费文本路由回执不符');
    return {};
  }
  const bytes = readFileSync(join(directory, 'readonly-after-probe.json'));
  const confirmationSHA256 = createHash('sha256').update(bytes).digest('hex');
  const confirmation = JSON.parse(bytes);
  const metadata = confirmation.metadata;
  if (
    value.version !== 'research-named-free-probe-v1' ||
    value.requestedModel !== namedModel ||
    value.canonicalModel !== canonicalModel ||
    sealed.body?.model !== namedModel ||
    sealed.catalog?.id !== namedModel ||
    sealed.catalog?.canonicalId !== canonicalModel ||
    value.actualModelMatches !== true ||
    !models.includes(value.actualModel) ||
    value.jsonValid !== true ||
    value.schemaValid !== true ||
    reference.confirmationSHA256 !== confirmationSHA256 ||
    sealed.baseResultSHA256 !== createHash('sha256').update(baseBytes).digest('hex') ||
    !/^gen-[A-Za-z0-9_-]{1,180}$/.test(value.providerGenerationId ?? '') ||
    metadata?.httpStatus !== 200 ||
    metadata.id !== value.providerGenerationId ||
    !models.includes(metadata.model) ||
    metadata.totalCostUSD !== '0' ||
    metadata.finishReason !== 'stop' ||
    metadata.inputTokens !== value.usage?.inputTokens ||
    metadata.outputTokens !== value.usage?.outputTokens ||
    confirmation.protectedUnchanged !== true
  )
    throw new Error('命名免费型号回执或只读生成确认不符');
  assert.deepEqual(value.response?.exactObject, { ok: true }, '测试输出不符合封存Schema');
  assert.deepEqual(sealed.body.response_format, {
    type: 'json_schema',
    json_schema: { name: 'availability_probe', strict: true, schema },
  });
  assert.deepEqual(confirmation.after, value.after, '只读确认目标不同');
  return { confirmationSHA256 };
}
