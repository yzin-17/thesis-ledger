export function browserRequestIdBoundaryViolation(file, source) {
  if (!file.startsWith('apps/desktop/src/') || file === 'apps/desktop/src/lib/client-request-id.ts') return null;
  if (/\bcrypto\s*\??\.\s*randomUUID\b/u.test(source)) {
    return '浏览器请求标识必须消费 Desktop createClientRequestId，兼容不提供 randomUUID 的环境';
  }
  return null;
}
