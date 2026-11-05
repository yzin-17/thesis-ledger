import {
  aiProviderInputSchema,
  aiProviderLifecycleOptionsSchema,
  aiProviderModelCatalogInputSchema,
  aiProviderTestOptionsSchema,
  aiProviderTestInputSchema,
  aiProviderTestCancelInputSchema,
  aiProviderRecordSchema,
  aiProviderRecordsSchema,
  aiProviderTestResultSchema,
  aiProviderModelCatalogResultSchema,
  aiProviderTestCancelResultSchema,
  aiProviderValidationPlanSchema,
  aiProviderValidationAuthorizationSchema,
  aiProviderValidationCancelResultSchema,
  aiRoutingSettingsViewSchema,
  aiRoutingSettingsUpdateSchema,
  type AiProviderLifecycleOptions,
  type AiProviderRecord,
  type AiProviderSaveInput,
  type AiProviderDraftTestInput,
  type AiProviderSavedTestOptions,
  type AiProviderModelCatalogRequest,
  type AiProviderValidationAuthorization,
  type AiRoutingSettingsUpdate,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

type ProviderInput = AiProviderSaveInput;
type TestOptions = AiProviderSavedTestOptions;
const json = (method: string, body?: unknown, signal?: AbortSignal): RequestInit => ({
  method,
  cache: 'no-store',
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  ...(signal === undefined ? {} : { signal }),
});
const path = (name: string) => `/ai/providers/${encodeURIComponent(name)}`;
const record = (name: string) => aiProviderRecordSchema.refine((row) => row.name === name);
export function aiProviderClient(request: ParsedRequest) {
  return {
    list: (signal?: AbortSignal) =>
      request('/ai/providers', aiProviderRecordsSchema, {
        cache: 'no-store',
        signal: signal ?? null,
      }),
    save: (input: ProviderInput, signal?: AbortSignal) => {
      aiProviderInputSchema.parse(input);
      return request('/ai/providers', record(input.name.trim()), json('POST', input, signal));
    },
    testDraft: (input: AiProviderDraftTestInput, signal?: AbortSignal) => {
      aiProviderTestInputSchema.parse(input);
      return request(
        '/ai/providers/test',
        aiProviderTestResultSchema.refine((row) => row.name === input.name.trim()),
        json('POST', input, signal),
      );
    },
    test: (name: string, input: TestOptions = {}, signal?: AbortSignal) => {
      aiProviderTestOptionsSchema.parse(input);
      return request(
        `${path(name)}/test`,
        aiProviderTestResultSchema.refine(
          (row) => row.name === name && (!input.requestId || row.requestId === input.requestId),
        ),
        json('POST', input, signal),
      );
    },
    cancelTest: (name: string, requestId: string) => {
      const input = aiProviderTestCancelInputSchema.parse({ requestId });
      return request(
        `${path(name)}/test/cancel`,
        aiProviderTestCancelResultSchema.refine(
          (row) => row.name === name && row.requestId === requestId,
        ),
        json('POST', input),
      );
    },
    models: (input: AiProviderModelCatalogRequest, signal?: AbortSignal) => {
      aiProviderModelCatalogInputSchema.parse(input);
      return request(
        '/ai/providers/models',
        aiProviderModelCatalogResultSchema,
        json('POST', input, signal),
      );
    },
    setEnabled: (name: string, enabled: boolean, options: AiProviderLifecycleOptions = {}) => {
      aiProviderLifecycleOptionsSchema.parse(options);
      if (typeof enabled !== 'boolean') throw new Error('启停状态必须是布尔值');
      return request(`${path(name)}/enabled`, record(name), json('PATCH', { enabled, ...options }));
    },
    remove: (name: string, options: AiProviderLifecycleOptions = {}) => {
      aiProviderLifecycleOptionsSchema.parse(options);
      const body = Object.keys(options).length ? options : undefined;
      return request(path(name), record(name), json('DELETE', body));
    },
    validationPlan: (input: ProviderInput, signal?: AbortSignal) => {
      aiProviderInputSchema.parse(input);
      return request(
        '/ai/providers/validation-plan',
        aiProviderValidationPlanSchema,
        json('POST', input, signal),
      );
    },
    testAndSave: (
      input: ProviderInput,
      authorization: AiProviderValidationAuthorization,
      signal?: AbortSignal,
    ): Promise<AiProviderRecord> => {
      aiProviderInputSchema.parse(input);
      aiProviderValidationAuthorizationSchema.parse(authorization);
      return request(
        '/ai/providers/test-and-save',
        record(input.name.trim()),
        json('POST', { provider: input, authorization }, signal),
      );
    },
    cancelValidation: (name: string, operationId: string) => {
      // operationId 与取消测试的 requestId 同为 UUID，复用现有身份约束。
      aiProviderTestCancelInputSchema.parse({ requestId: operationId });
      return request(
        `${path(name)}/validation/cancel`,
        aiProviderValidationCancelResultSchema,
        json('POST', { operationId }),
      );
    },
    settings: (signal?: AbortSignal) =>
      request('/ai/settings', aiRoutingSettingsViewSchema, {
        cache: 'no-store',
        signal: signal ?? null,
      }),
    updateSettings: (input: AiRoutingSettingsUpdate) => {
      aiRoutingSettingsUpdateSchema.parse(input);
      return request('/ai/settings', aiRoutingSettingsViewSchema, json('PATCH', input));
    },
  };
}
