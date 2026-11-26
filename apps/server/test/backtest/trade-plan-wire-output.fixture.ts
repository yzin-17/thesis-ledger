/** 只保留模型的最终 JSON，不保存独立推理字段或非 JSON 文本。 */
export function tradePlanWireOutput(
  response: Response,
  capture: (value: unknown) => void,
): Response {
  if (!response.body) return response;
  const decoder = new TextDecoder();
  let wire = '';
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        wire += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      flush() {
        wire += decoder.decode();
        try {
          const streaming = response.headers.get('content-type')?.includes('text/event-stream');
          const frames = streaming
            ? wire
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]')
                .map((line) => JSON.parse(line.slice(5)))
            : [JSON.parse(wire)];
          const content = frames
            .map(
              (frame) =>
                frame.choices?.[0]?.delta?.content ?? frame.choices?.[0]?.message?.content ?? '',
            )
            .join('');
          capture(JSON.parse(content));
        } catch {
          capture({ finalJsonAvailable: false });
        }
      },
    }),
  );
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
