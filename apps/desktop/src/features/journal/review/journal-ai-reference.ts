import { journalAiExplanationSchema } from '@thesis-ledger/schemas';

const idSchema = journalAiExplanationSchema.shape.id;
export type JournalAiTaskReference = { id: string; kind: 'object' | 'period' };

// 浏览器只保留任务引用；冻结输入仅参与摘要，不写入浏览器存储。
export async function journalAiReferenceKey(scope: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `journal-review-ai:v1:${hex}`;
}

export function readJournalAiReference(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      'id' in value &&
      value.version === 1 &&
      Object.keys(value).length === 2
    ) {
      const parsed = idSchema.safeParse(value.id);
      if (parsed.success) return parsed.data;
    }
    sessionStorage.removeItem(key);
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* 存储不可用时保持局部降级。 */
    }
  }
  return null;
}

export function writeJournalAiReference(key: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(key, JSON.stringify({ version: 1, id: idSchema.parse(id) }));
    else sessionStorage.removeItem(key);
  } catch {
    // 不把存储异常误报为服务端任务失败。
  }
}

export function readJournalAiTasks(key: string): JournalAiTaskReference[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    const rows: unknown[] = value;
    return rows.slice(0, 10).flatMap((row) => {
      if (
        typeof row !== 'object' ||
        row === null ||
        !('kind' in row) ||
        !('id' in row) ||
        (row.kind !== 'object' && row.kind !== 'period')
      )
        return [];
      const id = idSchema.safeParse(row.id);
      return id.success ? [{ id: id.data, kind: row.kind }] : [];
    });
  } catch {
    return [];
  }
}

export function rememberJournalAiTask(key: string, task: JournalAiTaskReference) {
  try {
    const previous = readJournalAiTasks(key).filter((row) => row.id !== task.id);
    sessionStorage.setItem(key, JSON.stringify([task, ...previous].slice(0, 10)));
  } catch {
    /* 本机不可保存时，服务端任务仍保留。 */
  }
}

export function forgetJournalAiTask(key: string, id: string) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify(readJournalAiTasks(key).filter((row) => row.id !== id)),
    );
  } catch {
    /* 不删除服务端任务。 */
  }
}
