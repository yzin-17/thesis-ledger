export async function performMobileWrite<T>(options: {
  online: boolean;
  execute: () => Promise<T>;
  refresh: () => Promise<unknown>;
}) {
  if (!options.online) throw new Error('当前离线，请联网后手动提交。');
  const result = await options.execute();
  let refreshFailed = false;
  try {
    await options.refresh();
  } catch {
    refreshFailed = true;
  }
  return { result, refreshFailed };
}
