import { File } from 'expo-file-system';

export type PickedFile = { uri: string; name: string; mimeType: string; size?: number };
export function appendPickedFile(body: FormData, file: PickedFile) {
  if (!file.uri || !file.name || !file.mimeType) throw new Error('文件信息不完整，请重新选择。');
  const content = new File(file.uri);
  // Expo fetch 读取 File.bytes()；保留选择器提供的文件名和 MIME，避免旧式 URI part。
  body.append('file', {
    name: file.name,
    type: file.mimeType,
    bytes: () => content.bytes(),
  } as unknown as Blob);
}
export function screenshotBody(file: PickedFile, accountId: string, source: string) {
  const body = new FormData();
  appendPickedFile(body, file);
  body.append('accountId', accountId);
  body.append('source', source);
  body.append('sourceConfidence', source === 'unknown' ? '0' : '1');
  body.append('extracted', '[]');
  return body;
}
