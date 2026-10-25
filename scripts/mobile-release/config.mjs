import { readFileSync } from 'node:fs';

export const signingVariables = [
  'ANDROID_KEYSTORE_FILE',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];
const keys = (value, allowed) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw Error('发布配置结构无效或包含未允许字段');
};
export function validateConfig(config) {
  keys(config, ['schemaVersion', 'bundleId', 'apiBaseUrl', 'android', 'ios']);
  keys(config.android, ['versionName', 'versionCode', 'format', 'certificateSha256']);
  keys(config.ios, [
    'version',
    'buildNumber',
    'distribution',
    'teamId',
    'identitySha1',
    'certificateSha256',
  ]);
  if (config.schemaVersion !== 1 || config.bundleId !== 'io.github.yzin17.thesisledger.mobile')
    throw Error('发布配置版本或包标识无效');
  const url = new URL(config.apiBaseUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('/api/v1')
  )
    throw Error('发布 API 必须是无凭据、无查询的 HTTPS /api/v1 地址');
  if (
    !/^\d+(\.\d+){1,2}$/.test(config.android.versionName) ||
    !Number.isSafeInteger(config.android.versionCode) ||
    config.android.versionCode < 1 ||
    !['apk', 'aab'].includes(config.android.format)
  )
    throw Error('Android 版本或格式无效');
  if (
    !/^\d+(\.\d+){1,2}$/.test(config.ios.version) ||
    !/^\d+(\.\d+){0,2}$/.test(config.ios.buildNumber) ||
    !['ad-hoc', 'app-store'].includes(config.ios.distribution)
  )
    throw Error('iOS 版本或导出方式无效');
  return config;
}
export function loadConfig(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw Error('发布配置文件无法读取或不是有效 JSON');
  }
  return validateConfig(parsed);
}
export function fingerprint(value, length = 64) {
  if (typeof value !== 'string') throw Error('证书固定指纹缺失');
  const normalized = value.replaceAll(':', '').toUpperCase();
  if (!new RegExp('^[0-9A-F]{' + length + '}$').test(normalized))
    throw Error('证书固定指纹缺失或无效');
  return normalized;
}
export function requireDeviceApi(config) {
  const host = new URL(config.apiBaseUrl).hostname;
  if (
    /^(localhost|127\.|0\.|10\.0\.2\.2$|\[?::1\]?$)/i.test(host) ||
    /(^|\.)(example\.(com|org|net)|invalid|test|localhost)$/i.test(host)
  )
    throw Error('正式签名需要设备可访问的真实 API，不能使用示例或模拟器地址');
}
export function signingNeeds(config, platform, env = process.env) {
  const missing = [];
  try {
    requireDeviceApi(config);
  } catch {
    missing.push('deviceApi');
  }
  try {
    fingerprint(config[platform].certificateSha256);
  } catch {
    missing.push('certificateSha256');
  }
  if (platform === 'android') {
    for (const key of signingVariables) if (!env[key]?.trim()) missing.push(key);
  } else {
    if (!/^[A-Z0-9]{10}$/.test(config.ios.teamId)) missing.push('teamId');
    try {
      fingerprint(config.ios.identitySha1, 40);
    } catch {
      missing.push('identitySha1');
    }
    if (!env.IOS_PROVISIONING_PROFILE?.trim()) missing.push('IOS_PROVISIONING_PROFILE');
  }
  return missing;
}
