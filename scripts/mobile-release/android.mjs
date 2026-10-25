import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fingerprint, signingVariables } from './config.mjs';
import { run } from './process.mjs';
import { verifyAndroidMetadata, verifyCertificate } from './policy.mjs';

export function androidTools(env = process.env) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk || !existsSync(path.join(sdk, 'build-tools'))) throw Error('缺少 Android SDK');
  const version = readdirSync(path.join(sdk, 'build-tools'))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  if (!version) throw Error('缺少 Android Build Tools');
  const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin') : '';
  return {
    apksigner: path.join(sdk, 'build-tools', version, 'apksigner'),
    aapt: path.join(sdk, 'build-tools', version, 'aapt'),
    keytool: java ? path.join(java, 'keytool') : 'keytool',
    jarsigner: java ? path.join(java, 'jarsigner') : 'jarsigner',
    java: java ? path.join(java, 'java') : 'java',
  };
}
const certificate = (cert) => ({
  sha256: cert.fingerprint256,
  subject: cert.subject,
  validFrom: cert.validFrom,
  validTo: cert.validTo,
});
export function preflightAndroid(config, env = process.env) {
  if (!signingVariables.every((k) => env[k]?.trim()) || !existsSync(env.ANDROID_KEYSTORE_FILE))
    throw Error('正式签名缺少完整环境变量或 keystore 文件');
  if ([env.ANDROID_KEYSTORE_PASSWORD, env.ANDROID_KEY_PASSWORD].some((v) => /[\r\n]/.test(v)))
    throw Error('签名密码不得包含换行');
  if (config.android.format === 'aab' && (!env.BUNDLETOOL_JAR || !existsSync(env.BUNDLETOOL_JAR)))
    throw Error('AAB 接续前必须提供 BUNDLETOOL_JAR');
  const tools = androidTools(env);
  const pem = run(
    tools.keytool,
    [
      '-exportcert',
      '-rfc',
      '-keystore',
      env.ANDROID_KEYSTORE_FILE,
      '-alias',
      env.ANDROID_KEY_ALIAS,
      '-storepass:env',
      'ANDROID_KEYSTORE_PASSWORD',
    ],
    { env },
  );
  verifyCertificate(certificate(new X509Certificate(pem)), config.android.certificateSha256);
}
export function androidBuild(root, config, signed) {
  const args = [
    config.android.format === 'aab' ? ':app:bundleRelease' : ':app:assembleRelease',
    '--no-daemon',
    '-PmobileReleaseVersionName=' + config.android.versionName,
    '-PmobileReleaseVersionCode=' + config.android.versionCode,
  ];
  if (!signed) args.push('-PmobileReleaseUnsigned=true', '-PreactNativeArchitectures=arm64-v8a');
  return {
    binary: path.join(root, 'apps/mobile/android/gradlew'),
    args,
    cwd: path.join(root, 'apps/mobile/android'),
  };
}
export function androidArtifact(root, config, signed) {
  if (config.android.format === 'aab')
    return path.join(root, 'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab');
  const base = path.join(root, 'apps/mobile/android/app/build/outputs/apk/release');
  return path.join(base, signed ? 'app-release.apk' : 'app-release-unsigned.apk');
}
function verifyApk(file, config, tools, options) {
  const signatures = run(
    tools.apksigner,
    ['verify', '--verbose', '--print-certs', '--print-certs-pem', file],
    options,
  );
  const actual = signatures.match(/Signer #1 certificate SHA-256 digest: ([0-9a-f:]+)/i)?.[1];
  if (
    !actual ||
    fingerprint(actual) !== fingerprint(config.android.certificateSha256) ||
    /Signer #2 certificate/.test(signatures)
  )
    throw Error('APK 签名证书不匹配或不是单一签名者');
  const pem = signatures.match(/-----BEGIN CERTIFICATE-----[^]*?-----END CERTIFICATE-----/)?.[0];
  if (!pem) throw Error('APK 签名证书不可读');
  const cert = certificate(new X509Certificate(pem));
  const xml = run(tools.aapt, ['dump', 'badging', file], options);
  const row = xml.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
  if (!row) throw Error('APK 元数据不可读');
  return verifyAndroidMetadata(
    {
      certificate: cert,
      bundleId: row[1],
      versionCode: row[2],
      versionName: row[3],
      debuggable: /application-debuggable/.test(xml),
    },
    config,
  );
}
function verifyAab(file, config, tools, options) {
  const env = options.env ?? process.env;
  if (!env.BUNDLETOOL_JAR || !existsSync(env.BUNDLETOOL_JAR))
    throw Error('AAB 身份校验需要 BUNDLETOOL_JAR');
  const verification = run(tools.jarsigner, ['-J-Duser.language=en', '-verify', file], options);
  if (
    !/jar verified\./i.test(verification) ||
    /unsigned entries|not signed|jar is unsigned/i.test(verification)
  )
    throw Error('AAB 没有覆盖全部内容的有效 JAR 签名');
  const certificates = run(tools.keytool, ['-printcert', '-rfc', '-jarfile', file], options);
  if ((certificates.match(/BEGIN CERTIFICATE/g) ?? []).length !== 1)
    throw Error('AAB 需要单一固定签名证书');
  const cert = certificate(new X509Certificate(certificates));
  const xml = run(
    tools.java,
    ['-jar', env.BUNDLETOOL_JAR, 'dump', 'manifest', '--bundle=' + file, '--module=base'],
    options,
  );
  return verifyAndroidMetadata(
    {
      certificate: cert,
      bundleId: xml.match(/\bpackage="([^"]+)"/)?.[1],
      versionCode: xml.match(/android:versionCode="([^"]+)"/)?.[1],
      versionName: xml.match(/android:versionName="([^"]+)"/)?.[1],
      debuggable: /android:debuggable="true"/.test(xml),
    },
    config,
  );
}
export function verifyAndroid(file, config, options = {}) {
  const tools = androidTools(options.env);
  if (file.endsWith('.apk')) return verifyApk(file, config, tools, options);
  if (file.endsWith('.aab')) return verifyAab(file, config, tools, options);
  throw Error('Android 校验只接受 APK/AAB');
}
export function verifyUnsignedAndroid(file, config, options = {}) {
  const tools = androidTools(options.env);
  if (!file.endsWith('.apk'))
    throw Error('未签名候选当前只验 APK；AAB 须走提供 bundletool 的正式校验路径');
  const result = spawnSync(tools.apksigner, ['verify', file], {
    encoding: 'utf8',
    env: options.env,
    timeout: 60000,
  });
  const text = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.status !== 1 || !/DOES NOT VERIFY|No.*signatures|Missing META-INF/i.test(text))
    throw Error('未签名候选的签名状态异常');
  const badging = run(tools.aapt, ['dump', 'badging', file], options);
  const row = badging.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
  if (
    !row ||
    row[1] !== config.bundleId ||
    row[2] !== String(config.android.versionCode) ||
    row[3] !== config.android.versionName ||
    /application-debuggable/.test(badging)
  )
    throw Error('未签名 APK 身份、版本或调试标记不符');
  return {
    unsigned: true,
    bundleId: row[1],
    versionCode: row[2],
    versionName: row[3],
    debuggable: false,
  };
}
