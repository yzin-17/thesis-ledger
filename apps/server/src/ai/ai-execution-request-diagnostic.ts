import {
  aiGenerationHttpRequestDiagnosticSchema,
  type AiGenerationHttpRequestDiagnostic,
  type AiRequestAttempt,
} from '@thesis-ledger/schemas';

type RequestDiagnosticFields = Pick<AiRequestAttempt, 'httpRequest'>;

export const parseRequestHttpDiagnostic = (value: unknown) =>
  value === undefined ? undefined : aiGenerationHttpRequestDiagnosticSchema.parse(value);

export const requestHttpDiagnosticFields = (
  facts: RequestDiagnosticFields,
): RequestDiagnosticFields => (facts.httpRequest ? { httpRequest: facts.httpRequest } : {});

/** 首次记录的请求参数为事实，后续结算修订不得覆盖或冲突。 */
export const mergeRequestHttpDiagnostic = (
  current: RequestDiagnosticFields,
  incoming: AiGenerationHttpRequestDiagnostic | undefined,
): RequestDiagnosticFields => {
  if (incoming === undefined) return {};
  if (current.httpRequest && JSON.stringify(current.httpRequest) !== JSON.stringify(incoming))
    throw new Error('同一请求 HTTP 诊断包含冲突事实');
  return { httpRequest: current.httpRequest ?? incoming };
};
