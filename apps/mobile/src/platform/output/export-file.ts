import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function exportCsv(name: string, content: string) {
  if (!/^[a-zA-Z0-9._-]+\.csv$/.test(name)) throw new Error('导出文件名无效。');
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不能打开系统文件分享。');
  const file = new File(Paths.cache, name);
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: '保存或分享 CSV',
  });
}
