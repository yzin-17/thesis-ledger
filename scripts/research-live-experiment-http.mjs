const MAX_ERROR_BYTES = 65536;

async function readErrorCodes(response) {
  const reader = response.clone().body?.getReader();
  if (!reader) return { errorBodyStatus: 'unavailable', errorCodes: [] };
  let timer;
  const reading = (async () => {
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ERROR_BYTES) return { errorBodyStatus: 'over_limit', errorCodes: [] };
      chunks.push(value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const candidates = [payload?.code, payload?.error?.code];
    if (Array.isArray(payload?.errors))
      candidates.push(...payload.errors.slice(0, 16).map((entry) => entry?.code));
    const codes = new Set();
    for (const value of candidates) {
      let code = value;
      if (typeof value === 'string' && /^\d{1,6}$/.test(value)) code = Number(value);
      if (Number.isSafeInteger(code) && code >= 0 && code <= 999999) codes.add(code);
    }
    const metadata = payload?.error?.metadata;
    const sources = new Set([
      'openrouter_credits',
      'openrouter_key_limit',
      'openrouter_in_flight_budget',
      'openrouter_guardrail_budget',
      'openrouter_workspace_budget',
    ]);
    const message =
      typeof payload?.error?.message === 'string' ? payload.error.message.slice(0, 4096) : '';
    return {
      errorBodyStatus: 'parsed',
      errorCodes: [...codes],
      limitSource: sources.has(metadata?.limit_source) ? metadata.limit_source : null,
      providerErrorCode: Number.isSafeInteger(metadata?.provider_code)
        ? metadata.provider_code
        : null,
      errorHints: {
        upstreamRateLimited:
          /rate.?limit|capacity/i.test(message) && /provider|upstream/i.test(message),
        dailyLimit: /daily|24.?hour|per day/i.test(message) && /limit|quota|exceed/i.test(message),
        noEndpoints: /no endpoints|model.*not found/i.test(message),
      },
    };
  })().catch(() => ({ errorBodyStatus: 'unavailable', errorCodes: [] }));
  try {
    return await Promise.race([
      reading,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ errorBodyStatus: 'unavailable', errorCodes: [] }), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export async function captureCloudflareExperimentResponse(response) {
  const summary = {
    status: response.status,
    cfRay: response.headers.get('cf-ray'),
    headersAt: new Date().toISOString(),
    retryAfterSeconds: null,
    retryAfterAt: null,
    errorBodyStatus: 'not_needed',
    errorCodes: [],
    limitSource: null,
    providerErrorCode: null,
    errorHints: null,
    rateLimit: {},
  };
  for (const field of ['limit', 'remaining', 'reset']) {
    const value = response.headers.get('x-ratelimit-' + field);
    if (value && /^\d{1,15}$/.test(value) && Number.isSafeInteger(Number(value)))
      summary.rateLimit[field] = Number(value);
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d{1,15}$/.test(retryAfter)) {
    const seconds = Number(retryAfter);
    if (Number.isSafeInteger(seconds)) summary.retryAfterSeconds = seconds;
  } else if (retryAfter) {
    const date = new Date(retryAfter);
    if (Number.isFinite(date.getTime()) && date.toUTCString() === retryAfter)
      summary.retryAfterAt = date.toISOString();
  }
  if (!response.ok)
    Object.assign(
      summary,
      await readErrorCodes(response).catch(() => ({
        errorBodyStatus: 'unavailable',
        errorCodes: [],
      })),
    );
  return summary;
}
