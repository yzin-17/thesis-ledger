import storage from '@react-native-async-storage/async-storage';

// 使用真实原生存储的独立命名空间，避免覆盖用户连接及草稿。
const prefix = 'strategy-definition-native-20261116:';
const isolatedStorage = {
  getItem: (key: string) => storage.getItem(prefix + key),
  setItem: (key: string, value: string) => storage.setItem(prefix + key, value),
  removeItem: (key: string) => storage.removeItem(prefix + key),
};
export async function clearNativeEditorStorage() {
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await storage.multiRemove(keys);
}
export async function resetNativeEditorStorage() {
  await clearNativeEditorStorage();
  await isolatedStorage.setItem(
    'thesis-ledger-mobile-connection-v1',
    'http://127.0.0.1:5193/api/v1',
  );
}
export default isolatedStorage;
