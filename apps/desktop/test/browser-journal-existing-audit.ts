export type JournalExistingAuditRow = {
  phase: string;
  method: string;
  path: string;
  status: number;
  source: 'target' | 'blocked' | 'injected';
};
const auditKey = 'journal-existing-browser:audit';
const phaseKey = 'journal-existing-browser:phase';
const failureKey = 'journal-existing-browser:fail-next-ai-read';
let restoreFetch = () => {};

export function journalExistingRequestAllowed(path: string, method: string) {
  if (method === 'GET') return true;
  return (
    method === 'POST' &&
    ['/api/v1/journal/analysis/object', '/api/v1/journal/analysis/period'].includes(path)
  );
}
export function readJournalExistingAudit(): JournalExistingAuditRow[] {
  return JSON.parse(sessionStorage.getItem(auditKey) ?? '[]') as JournalExistingAuditRow[];
}
export function setJournalExistingPhase(phase: string) {
  sessionStorage.setItem(phaseKey, phase);
}
export function armJournalExistingReadFailure() {
  sessionStorage.setItem(failureKey, '1');
}
export function installJournalExistingAudit() {
  restoreFetch();
  const originalFetch = window.fetch;
  const forward = originalFetch.bind(window);
  const auditedFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), location.origin);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    let response: Response;
    let source: JournalExistingAuditRow['source'] = 'target';
    if (!journalExistingRequestAllowed(url.pathname, method)) {
      source = 'blocked';
      response = Response.json({ message: '验收入口只允许读取及确定性分析' }, { status: 405 });
    } else if (
      method === 'GET' &&
      /\/journal\/(period-)?explanations\//.test(url.pathname) &&
      sessionStorage.getItem(failureKey) === '1'
    ) {
      sessionStorage.removeItem(failureKey);
      source = 'injected';
      response = Response.json({ message: '验收注入：一次 AI 读取失败' }, { status: 503 });
    } else {
      response = await forward(input, init);
    }
    const rows = readJournalExistingAudit();
    rows.push({
      phase: sessionStorage.getItem(phaseKey) ?? '初始读取',
      method,
      path: `${url.pathname}${url.search}`,
      status: response.status,
      source,
    });
    sessionStorage.setItem(auditKey, JSON.stringify(rows));
    window.dispatchEvent(new Event('journal-existing-audit'));
    return response;
  };
  window.fetch = auditedFetch;
  restoreFetch = () => {
    if (window.fetch === auditedFetch) window.fetch = originalFetch;
  };
}
import.meta.hot?.dispose(() => restoreFetch());
