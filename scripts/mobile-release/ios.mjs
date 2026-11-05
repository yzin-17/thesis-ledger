import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './config.mjs';
import { run, plistJson, plistData, decodeProfile, sha256 } from './process.mjs';
import { verifyProfile, verifyCertificate, verifyIosMetadata } from './policy.mjs';

const profileHashes = (profile) =>
  (profile.DeveloperCertificates ?? []).map((c) => sha256(Buffer.from(c, 'base64')));
export function preflightIos(config, env = process.env) {
  if (!env.IOS_PROVISIONING_PROFILE || !existsSync(env.IOS_PROVISIONING_PROFILE))
    throw Error('缺少 iOS 描述文件');
  const profile = decodeProfile(env.IOS_PROVISIONING_PROFILE, { env });
  verifyProfile(profile, config, profileHashes(profile));
  const cert = profile.DeveloperCertificates.map(
    (c) => new X509Certificate(Buffer.from(c, 'base64')),
  ).find((c) => fingerprint(c.fingerprint256) === fingerprint(config.ios.certificateSha256));
  if (!cert) throw Error('描述文件中未找到固定证书');
  if (fingerprint(cert.fingerprint, 40) !== fingerprint(config.ios.identitySha1, 40))
    throw Error('签名身份 SHA-1 与固定证书不一致');
  verifyCertificate(
    {
      sha256: cert.fingerprint256,
      subject: cert.subject,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
    },
    config.ios.certificateSha256,
  );
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
    env,
  });
  if (
    !identities
      .split('\n')
      .some((l) => l.includes(fingerprint(config.ios.identitySha1, 40)) && /Distribution:/.test(l))
  )
    throw Error('当前钥匙串没有指定的分发签名身份');
  return profile;
}
export function exportOptions(config, profile) {
  let method = 'release-testing';
  if (config.ios.distribution === 'app-store') method = 'app-store-connect';
  return {
    method,
    destination: 'export',
    signingStyle: 'manual',
    teamID: config.ios.teamId,
    signingCertificate: fingerprint(config.ios.identitySha1, 40),
    provisioningProfiles: { [config.bundleId]: profile.UUID },
    manageAppVersionAndBuildNumber: false,
    uploadSymbols: false,
  };
}
export function iosBuild(root, config, signed, output, profile, derivedData) {
  const args = [
    '-workspace',
    path.join(root, 'apps/mobile/ios/ThesisLedger.xcworkspace'),
    '-scheme',
    'ThesisLedger',
    '-configuration',
    'Release',
    '-sdk',
    'iphoneos',
    '-destination',
    'generic/platform=iOS',
    '-derivedDataPath',
    derivedData ?? path.join(output, 'derived-data'),
    '-archivePath',
    path.join(output, 'ThesisLedger.xcarchive'),
    '-jobs',
    '2',
    'COMPILER_INDEX_STORE_ENABLE=NO',
    'MOBILE_RELEASE_VERSION=' + config.ios.version,
    'MOBILE_RELEASE_BUILD_NUMBER=' + config.ios.buildNumber,
  ];
  if (signed)
    args.push(
      'MOBILE_RELEASE_SIGNING_STYLE=Manual',
      'MOBILE_RELEASE_TEAM_ID=' + config.ios.teamId,
      'MOBILE_RELEASE_PROFILE=' + profile.UUID,
      'MOBILE_RELEASE_IDENTITY=' + fingerprint(config.ios.identitySha1, 40),
    );
  else args.push('CODE_SIGNING_ALLOWED=NO');
  args.push('archive');
  return { binary: '/usr/bin/xcodebuild', args, cwd: root };
}
function archivedApp(file) {
  if (file.endsWith('.app')) return file;
  const dir = path.join(file, 'Products/Applications');
  if (!file.endsWith('.xcarchive') || !existsSync(dir))
    throw Error('iOS 校验需要 app、xcarchive 或 IPA');
  const apps = readdirSync(dir).filter((f) => f.endsWith('.app'));
  if (apps.length !== 1) throw Error('iOS archive 必须只有一个主应用');
  return path.join(dir, apps[0]);
}
function verifyApp(app, config, scratch, options) {
  const info = plistJson(path.join(app, 'Info.plist'), options);
  if (info.DTPlatformName !== 'iphoneos')
    throw Error('Simulator 或非 iPhoneOS 产物不能通过正式签名校验');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], options);
  const details = run('/usr/bin/codesign', ['-d', '--verbose=4', app], {
    ...options,
    combined: true,
  });
  run(
    '/usr/bin/codesign',
    ['-d', '--extract-certificates', path.join(scratch, 'cert'), app],
    options,
  );
  const cert = new X509Certificate(readFileSync(path.join(scratch, 'cert0')));
  const profile = decodeProfile(path.join(app, 'embedded.mobileprovision'), options);
  const ent = run('/usr/bin/codesign', ['-d', '--entitlements', ':-', app], options);
  const entitlements = plistData(ent, options);
  const metadata = {
    platform: info.DTPlatformName,
    bundleId: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    buildNumber: info.CFBundleVersion,
    teamId: details.match(/^TeamIdentifier=(.+)$/m)?.[1],
    authorities: [...details.matchAll(/^Authority=(.+)$/gm)].map((x) => x[1]),
    certificate: {
      sha256: cert.fingerprint256,
      subject: cert.subject,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
    },
    profile,
    profileCertificateHashes: profileHashes(profile),
    entitlements,
  };
  const arch = run('/usr/bin/lipo', ['-archs', path.join(app, info.CFBundleExecutable)], options);
  if (!arch.split(/\s+/).includes('arm64')) throw Error('设备产物缺少 arm64');
  return verifyIosMetadata(metadata, config);
}
export function verifyIos(file, config, options = {}) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'thesis-mobile-verify-'));
  try {
    let app;
    if (file.endsWith('.ipa')) {
      run(
        'python3',
        [path.join(path.dirname(fileURLToPath(import.meta.url)), 'ipa-extract.py'), file, scratch],
        options,
      );
      const dir = path.join(scratch, 'Payload'),
        apps = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.app')) : [];
      if (apps.length !== 1) throw Error('IPA 必须只有一个主应用');
      app = path.join(dir, apps[0]);
    } else app = archivedApp(file);
    return verifyApp(app, config, scratch, options);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
export function verifyUnsignedIos(file, config, options = {}) {
  const app = archivedApp(file),
    info = plistJson(path.join(app, 'Info.plist'), options);
  if (
    info.DTPlatformName !== 'iphoneos' ||
    info.CFBundleIdentifier !== config.bundleId ||
    info.CFBundleShortVersionString !== config.ios.version ||
    String(info.CFBundleVersion) !== config.ios.buildNumber
  )
    throw Error('未签名 archive 的平台、身份或版本不符');
  if (existsSync(path.join(app, 'embedded.mobileprovision')))
    throw Error('未签名候选不应携带描述文件');
  const result = spawnSync('/usr/bin/codesign', ['--verify', app], {
    encoding: 'utf8',
    timeout: 60000,
  });
  if (
    result.status === 0 ||
    !/not signed at all/.test((result.stdout ?? '') + (result.stderr ?? ''))
  )
    throw Error('iOS 未签名候选的签名状态异常');
  return {
    unsigned: true,
    bundleId: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    buildNumber: info.CFBundleVersion,
    platform: info.DTPlatformName,
  };
}
