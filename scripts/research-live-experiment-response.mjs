const MAX_METADATA_BYTES = 65536;

export function observeExperimentResponse(response, onIdentity) {
  if (!response.ok || !response.body) {
    onIdentity({ generationId: null, actualModel: null, status: 'http_rejected_or_empty' });
    return response;
  }
  const sse = response.headers.get('content-type')?.includes('text/event-stream');
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '',
    generationId = null,
    actualModel = null,
    previous = '';
  const emit = (status) => {
    const value = { generationId, actualModel, status };
    const key = JSON.stringify(value);
    if (key !== previous) {
      previous = key;
      onIdentity(value);
    }
  };
  const parse = (line) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (typeof value.id === 'string' && /^gen-[A-Za-z0-9_-]{1,180}$/.test(value.id))
      generationId = value.id;
    if (typeof value.model === 'string' && /^[A-Za-z0-9._:/-]{1,160}$/.test(value.model))
      actualModel = value.model;
    if (generationId !== null) emit('observed');
  };
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        if (bytes > MAX_METADATA_BYTES) return;
        bytes += chunk.byteLength;
        if (bytes > MAX_METADATA_BYTES) {
          text = '';
          emit('over_limit');
          return;
        }
        text += decoder.decode(chunk, { stream: true });
        if (sse) {
          const lines = text.split('\n');
          text = lines.pop();
          for (const line of lines) if (line.startsWith('data:')) parse(line.slice(5).trim());
        }
      },
      flush() {
        if (bytes > MAX_METADATA_BYTES) return;
        text += decoder.decode();
        if (sse) {
          if (text.startsWith('data:')) parse(text.slice(5).trim());
        } else parse(text);
        emit(generationId === null ? 'missing' : 'observed');
      },
    }),
  );
  const observed = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperty(observed, 'url', { value: response.url });
  return observed;
}
