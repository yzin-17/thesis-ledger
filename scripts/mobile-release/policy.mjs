import { fingerprint } from './config.mjs';

export function verifyCertificate(meta, expected) {
  if (fingerprint(meta.sha256) !== fingerprint(expected)) throw Error('签名证书与固定指纹不符');
  if (/Android Debug|CN=localhost/i.test(meta.subject)) throw Error('正式产物不能使用调试证书');
  const now = Date.now();
  if (
    !Number.isFinite(Date.parse(meta.validFrom)) ||
    !Number.isFinite(Date.parse(meta.validTo)) ||
    Date.parse(meta.validFrom) > now ||
    Date.parse(meta.validTo) <= now
  )
    throw Error('签名证书尚未生效或已经过期');
}
export function verifyAndroidMetadata(meta, config) {
  verifyCertificate(meta.certificate, config.android.certificateSha256);
  if (
    meta.bundleId !== config.bundleId ||
    meta.versionName !== config.android.versionName ||
    String(meta.versionCode) !== String(config.android.versionCode)
  )
    throw Error('Android 包身份或版本不符');
  if (meta.debuggable !== false) throw Error('正式 Android 包不能是 debuggable');
  return {
    bundleId: meta.bundleId,
    versionName: meta.versionName,
    versionCode: String(meta.versionCode),
    certificateSha256: fingerprint(meta.certificate.sha256),
  };
}
export function verifyProfile(profile, config, certificateHashes) {
  const ios = config.ios,
    ent = profile.Entitlements ?? {};
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(profile.UUID) ||
    !profile.Platform?.includes('iOS')
  )
    throw Error('描述文件标识或平台无效');
  if (
    !profile.TeamIdentifier?.includes(ios.teamId) ||
    ent['com.apple.developer.team-identifier'] !== ios.teamId
  )
    throw Error('描述文件 Team 不匹配');
  if (
    !Number.isFinite(Date.parse(profile.ExpirationDate)) ||
    Date.parse(profile.ExpirationDate) <= Date.now()
  )
    throw Error('描述文件已经过期或日期无效');
  if (ent['get-task-allow'] !== false || profile.ProvisionsAllDevices === true)
    throw Error('描述文件用途不符合本次正式分发');
  const appId = profile.ApplicationIdentifierPrefix?.[0] + '.' + config.bundleId;
  if (ent['application-identifier'] !== appId) throw Error('描述文件 App ID 不匹配');
  const registered =
    Array.isArray(profile.ProvisionedDevices) && profile.ProvisionedDevices.length > 0;
  if ((ios.distribution === 'ad-hoc') !== registered) throw Error('描述文件与导出渠道不匹配');
  if (
    !certificateHashes
      .map((value) => fingerprint(value))
      .includes(fingerprint(ios.certificateSha256))
  )
    throw Error('描述文件未绑定本次签名证书');
  return { uuid: profile.UUID, appId, teamId: ios.teamId, expiration: profile.ExpirationDate };
}
export function verifyIosMetadata(meta, config) {
  if (
    meta.platform !== 'iphoneos' ||
    meta.bundleId !== config.bundleId ||
    meta.version !== config.ios.version ||
    String(meta.buildNumber) !== config.ios.buildNumber
  )
    throw Error('iOS 设备平台、包身份或版本不符');
  if (
    meta.teamId !== config.ios.teamId ||
    !meta.authorities.some((a) => /^(Apple|iPhone|iOS) Distribution:/.test(a))
  )
    throw Error('iOS 签名身份不是指定 Team 的分发证书');
  verifyCertificate(meta.certificate, config.ios.certificateSha256);
  const profile = verifyProfile(meta.profile, config, meta.profileCertificateHashes);
  if (
    meta.entitlements['get-task-allow'] !== false ||
    meta.entitlements['application-identifier'] !== profile.appId ||
    meta.entitlements['com.apple.developer.team-identifier'] !== config.ios.teamId
  )
    throw Error('已签名 entitlements 与描述文件不符');
  return {
    bundleId: meta.bundleId,
    teamId: meta.teamId,
    certificateSha256: fingerprint(meta.certificate.sha256),
    profile: profile.uuid,
  };
}
