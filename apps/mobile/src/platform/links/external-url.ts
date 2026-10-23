export function safeExternalUrl(value: string, allowedHosts?: readonly string[]): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (allowedHosts && !allowedHosts.includes(url.hostname))
  )
    throw new Error('该链接不在允许的访问范围内。');
  return url.toString();
}
