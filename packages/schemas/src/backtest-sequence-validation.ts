export function replaceEventValue(input: unknown, capture: unknown): unknown {
  if (Array.isArray(input)) return input.map((value) => replaceEventValue(value, capture));
  if (!input || typeof input !== 'object') return input;
  const node = input as Record<string, unknown>;
  if (node.type === 'eventValue' && capture) return capture;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, replaceEventValue(value, capture)]),
  );
}
export function containsSequence(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(containsSequence);
  if (!input || typeof input !== 'object') return false;
  const node = input as Record<string, unknown>;
  return node.type === 'sequence' || Object.values(node).some(containsSequence);
}

export function invalidEventValueScope(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(invalidEventValueScope);
  if (!input || typeof input !== 'object') return false;
  const node = input as Record<string, unknown>;
  if (
    [
      'indicator',
      'lag',
      'rolling',
      'cumulative',
      'countTrue',
      'consecutive',
      'confirmedPivot',
    ].includes(String(node.type))
  )
    return containsEventValue(node);
  return Object.values(node).some(invalidEventValueScope);
}

function containsEventValue(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(containsEventValue);
  if (!input || typeof input !== 'object') return false;
  const node = input as Record<string, unknown>;
  return node.type === 'eventValue' || Object.values(node).some(containsEventValue);
}
