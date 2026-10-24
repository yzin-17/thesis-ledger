import AsyncStorage from '@react-native-async-storage/async-storage';
export type JournalTask = { id: string; kind: 'object' | 'period' };
export const journalTaskKey = (baseUrl: string, accountId: string, mode: string) =>
  JSON.stringify(['mobile-journal-ai-v1', baseUrl, accountId, mode]);
export async function readJournalTasks(key: string): Promise<JournalTask[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('本机解读引用格式无效，未自动删除。');
  const rows: unknown[] = data;
  const tasks = rows.filter((v): v is JournalTask =>
    Boolean(
      v &&
      typeof v === 'object' &&
      'id' in v &&
      typeof v.id === 'string' &&
      /^[a-f0-9-]{36}$/i.test(v.id) &&
      'kind' in v &&
      (v.kind === 'object' || v.kind === 'period'),
    ),
  );
  if (tasks.length !== rows.length) throw new Error('本机解读引用格式无效，未自动删除。');
  return tasks;
}
export async function rememberJournalTask(key: string, task: JournalTask) {
  const previous = await readJournalTasks(key);
  await AsyncStorage.setItem(
    key,
    JSON.stringify([task, ...previous.filter((p) => p.id !== task.id)].slice(0, 50)),
  );
}
