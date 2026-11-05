const sensitiveKey =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|secret|(?:x-)?api[-_]?key|credential|credentials|encryptedCredentials|access[-_]?token|refresh[-_]?token)$/iu;
const reasoningKey =
  /^(?:reasoning|thinking|reasoning[-_]?content|reasoning[-_]?details|thinking[-_]?content)$/iu;

/** 只用于私有取证副本；不会修改请求或交给 SDK 的响应。 */
export function redactAiTrace(value: unknown, secrets: ReadonlySet<string>, depth = 0): unknown {
  if (depth > 32) return '[REDACTED_DEPTH_LIMIT]';
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets) if (secret) text = text.split(secret).join('[REDACTED]');
    text = text.replace(/Bearer\s+[^\s"'<>]+/giu, 'Bearer [REDACTED]');
    return redactEmbeddedJson(text, secrets, depth);
  }
  if (Array.isArray(value)) return value.map((v) => redactAiTrace(v, secrets, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const typed = value as { type?: unknown };
    if (typeof typed.type === 'string' && /(?:reasoning|thinking)/iu.test(typed.type))
      return { type: typed.type, redacted: true };
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (sensitiveKey.test(key)) return [key, '[REDACTED]'];
        if (
          reasoningKey.test(key) &&
          entry !== null &&
          typeof entry !== 'number' &&
          typeof entry !== 'boolean'
        ) {
          return [
            key,
            { redacted: true, characters: typeof entry === 'string' ? entry.length : null },
          ];
        }
        return [key, redactAiTrace(entry, secrets, depth + 1)];
      }),
    );
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function redactEmbeddedJson(text: string, secrets: ReadonlySet<string>, depth: number) {
  if (!['{', '['].includes(text.trimStart()[0] ?? '')) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    const redacted = redactAiTrace(parsed, secrets, depth + 1);
    return JSON.stringify(parsed) === JSON.stringify(redacted) ? text : JSON.stringify(redacted);
  } catch {
    return text;
  }
}

export function aiTraceHeaders(headers: HeadersInit | undefined) {
  return Object.fromEntries(new Headers(headers).entries());
}

export function aiTraceUrl(input: Parameters<typeof fetch>[0]) {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? String(input) : input.url,
  );
  return { origin: url.origin, pathname: url.pathname, queryKeys: [...url.searchParams.keys()] };
}
