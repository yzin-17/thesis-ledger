export const aiCatalogBoundaryViolation = (file, source) => {
  if (!file.startsWith('apps/server/src/ai/') || !file.includes('catalog')) return null;
  if (/https?:\/\//u.test(source)) return '模型目录执行不得内置提供方地址，地址必须来自用户配置';
  if (
    /\.(?:hostname|host|origin|providerName|providerId|name)\s*(?:===|!==|==|!=)\s*['"`]/u.test(
      source,
    )
  )
    return '模型目录执行不得按提供方域名或名称分支';
  return null;
};
