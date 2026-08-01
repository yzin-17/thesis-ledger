export class InvestmentOsApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(new URL(path.replace(/^\/+/, ''), this.baseUrl), {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (!response.ok) throw new Error(`Investment OS API ${response.status}`);
    return (await response.json()) as T;
  }
}
