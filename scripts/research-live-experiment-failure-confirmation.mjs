import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { researchGenerationV2Contract } = require('@thesis-ledger/schemas');
const { z } = require('zod');
const schema = researchGenerationV2Contract.schema;
const safeKeys = new Set();
const walk = (value) => {
  if (!value || typeof value !== 'object') return;
  if (value.properties) Object.keys(value.properties).forEach((key) => safeKeys.add(key));
  Object.values(value).forEach(walk);
};
walk(z.toJSONSchema(schema));

export function createLiveFailureConfirmer({
  getCredential,
  identityForRequest,
  isModelQualified,
  save,
  httpClient = fetch,
  signal,
}) {
  const records = new Map();
  return async (request) => {
    const identity = identityForRequest(request.requestId);
    const record = {
      localRequestId: request.requestId,
      generationId: identity?.generationId ?? null,
      at: new Date().toISOString(),
      modelRequests: 0,
      http: [],
      outcome: 'unconfirmed',
    };
    const finish = (outcome, value = null) => {
      record.outcome = outcome;
      records.set(request.requestId, record);
      save('failure-generation-confirmations.json', [...records.values()]);
      return value;
    };
    if (
      !identity?.generationId ||
      !/^gen-[A-Za-z0-9_-]{1,180}$/.test(identity.generationId) ||
      !isModelQualified(identity.actualModel)
    )
      return finish('identity_missing_or_unqualified');
    const read = async (endpoint) => {
      const url = new URL('https://openrouter.ai/api/v1/' + endpoint);
      url.searchParams.set('id', identity.generationId);
      const timeout = AbortSignal.timeout(15000);
      const response = await httpClient(url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + getCredential() },
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      record.http.push({ endpoint, status: response.status });
      if (!response.ok) {
        await response.body?.cancel();
        throw Error('只读回执不可用');
      }
      const reader = response.body.getReader(),
        chunks = [];
      let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 131072) {
          void reader.cancel();
          throw Error('只读回执超限');
        }
        chunks.push(part.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')).data;
    };
    try {
      const metadata = await read('generation');
      const usage = request.facts.at(-1)?.usage;
      const matches = (input, output) =>
        Number.isSafeInteger(input) &&
        Number.isSafeInteger(output) &&
        input === usage?.inputTokens &&
        output === usage?.outputTokens;
      const usageMatches =
        matches(metadata.native_tokens_prompt, metadata.native_tokens_completion) ||
        matches(metadata.tokens_prompt, metadata.tokens_completion);
      record.model =
        typeof metadata.model === 'string' && /^[A-Za-z0-9._:/-]{1,160}$/.test(metadata.model)
          ? metadata.model
          : null;
      record.usageMatches = usageMatches;
      record.reportedCostUSD =
        typeof metadata.total_cost === 'number' &&
        Number.isFinite(metadata.total_cost) &&
        metadata.total_cost >= 0
          ? String(metadata.total_cost)
          : null;
      const zeroCost =
        metadata.total_cost === 0 ||
        (typeof metadata.total_cost === 'string' && /^0(?:\.0+)?$/.test(metadata.total_cost));
      if (
        metadata.id !== identity.generationId ||
        !isModelQualified(record.model) ||
        metadata.finish_reason !== 'stop' ||
        !zeroCost ||
        !usageMatches
      )
        return finish('metadata_mismatch');
      record.totalCostUSD = '0';
      record.metadataConfirmed = true;
      const content = await read('generation/content');
      const text = content?.output?.completion;
      if (typeof text !== 'string' || text.length > 65536)
        return finish('completion_missing_or_oversize');
      record.outputSHA256 = createHash('sha256').update(text).digest('hex');
      record.outputCharacters = text.length;
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return finish('completion_json_invalid');
      }
      record.jsonValid = true;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return finish('completion_root_not_object');
      const checked = schema.safeParse(parsed);
      record.schemaValid = checked.success;
      if (checked.success) return finish('sdk_and_stored_schema_disagree');
      record.issueCount = checked.error.issues.length;
      record.issues = checked.error.issues.slice(0, 40).map((issue) => ({
        code: issue.code,
        path: issue.path.map((part) =>
          typeof part === 'number' ? '[index]' : safeKeys.has(part) ? part : '[unknown-key]',
        ),
      }));
      return finish('confirmed_schema_failure', {
        requestId: request.requestId,
        generationId: identity.generationId,
        actualModel: record.model,
        totalCostUSD: '0',
        usageMatches: true,
        metadataConfirmed: true,
        jsonValid: true,
        schemaValid: false,
      });
    } catch {
      return finish('readonly_confirmation_failed');
    }
  };
}
