/** 只保留校验位置和稳定代码，不记录模型文本、请求内容或凭据。 */
export function authoringValidationIssues(error: unknown): Array<{ code: string; path: string }> {
  const issues: Array<{ code: string; path: string }> = [];
  const visited = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (
      depth > 8 ||
      issues.length >= 12 ||
      !value ||
      typeof value !== 'object' ||
      visited.has(value)
    )
      return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.code === 'string' &&
      /^[a-z_]{1,40}$/u.test(record.code) &&
      Array.isArray(record.path)
    ) {
      const path = record.path
        .slice(0, 12)
        .map((part: unknown) => {
          if (typeof part === 'number' && Number.isSafeInteger(part)) return String(part);
          if (typeof part === 'string' && /^[A-Za-z_][A-Za-z_0-9]{0,39}$/u.test(part)) return part;
          return '?';
        })
        .join('.');
      issues.push({ code: record.code, path });
    }
    for (const key of ['cause', 'issues', 'errors']) visit(record[key], depth + 1);
  };
  visit(error, 0);
  return issues;
}
