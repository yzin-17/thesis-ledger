/** 仅替换模型 HTTP 客户端，不重发请求、不改变 URL、正文或凭据。 */
export async function createArenaModelHttpClient(requestOverride) {
  const { request: nativeRequest } = await import('node:https');
  const request = requestOverride ?? nativeRequest;
  return async (input, init) => {
    const req = new Request(input, init);
    if (new URL(req.url).origin !== 'https://api.openai.com') throw new Error('模型 HTTP 目标不符');
    const body = Buffer.from(await req.arrayBuffer());
    return new Promise((resolve, reject) => {
      const headers = Object.fromEntries(req.headers.entries());
      headers.connection = 'close'; headers['accept-encoding'] = 'identity';
      const outgoing = request(req.url, { method: req.method, headers, agent: false, signal: req.signal }, incoming => {
        const chunks = [];
        incoming.on('data', part => chunks.push(part));
        incoming.on('error', reject);
        incoming.on('end', () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, item);
            else if (value !== undefined) responseHeaders.set(key, value);
          }
          resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: responseHeaders }));
        });
      });
      outgoing.on('error', reject); outgoing.end(body);
    });
  };
}
