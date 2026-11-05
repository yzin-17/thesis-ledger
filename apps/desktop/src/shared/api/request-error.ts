import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';

const unavailable = '服务暂时无法完成本次操作，请稍后重试。';
/** 展示请求失败，不改变请求、业务终态或重试策略。 */
export function presentRequestFailure(error: unknown, fallback = unavailable) {
  if (error instanceof ThesisLedgerApiError) {
    const technical = {
      status: error.status,
      code: error.payload?.errorCode ?? null,
      fields: error.payload?.fields ?? null,
      details: error.payload?.details ?? null,
    };
    if (error.status >= 500) return { message: unavailable, technical };
    const message = error.payload?.message;
    const fields = error.payload?.fields
      ?.map((field) => field.message)
      .filter((value) => /[\u3400-\u9fff]/u.test(value));
    if (fields?.length) return { message: fields.join('；'), technical };
    if (message && /[\u3400-\u9fff]/u.test(message)) return { message, technical };
    if (error.status === 409) return { message: '数据版本已变化，请重新读取后再操作。', technical };
    if (error.status === 429) return { message: '请求较多，请稍候再试。', technical };
    return { message: fallback, technical };
  }
  if (error instanceof ThesisLedgerContractError)
    return { message: '服务响应尚无法确认，请先重新读取结果，避免重复提交。', technical: null };
  if (error instanceof Error) {
    if (
      /Failed to fetch|fetch failed|NetworkError|Network request failed|Load failed|ECONN|ERR_NETWORK/iu.test(
        error.message,
      )
    )
      return { message: '网络连接中断，请检查连接后重试。', technical: null };
    if (error.name === 'AbortError' || error.name === 'TimeoutError')
      return {
        message: '请求已中断，结果尚未确认。请先重新读取，再决定是否重试。',
        technical: null,
      };
    if (
      !/^(?:ThesisLedger\s+)?API\b/iu.test(error.message) &&
      /[\u3400-\u9fff]/u.test(error.message)
    )
      return { message: error.message, technical: null };
  }
  return { message: fallback, technical: null };
}

export const requestFailureMessage = (error: unknown, fallback?: string) =>
  presentRequestFailure(error, fallback).message;
