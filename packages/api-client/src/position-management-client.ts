type ResponseRequest = (path: string, init?: RequestInit) => Promise<Response>;

export function positionManagementClient(response: ResponseRequest) {
  return {
    async remove(id: string) {
      await response(`/portfolio/positions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async clear(accountId: string) {
      await response('/portfolio/positions/clear', {
        method: 'POST',
        body: JSON.stringify({ accountId }),
      });
    },
  };
}
