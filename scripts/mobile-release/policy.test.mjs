import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig, signingNeeds, requireDeviceApi } from './config.mjs';
import { verifyAndroidMetadata, verifyIosMetadata } from './policy.mjs';
import { exportOptions, iosBuild } from './ios.mjs';
import { androidBuild } from './android.mjs';
import { redact, plistData } from './process.mjs';

const sample = JSON.parse(
  readFileSync(new URL('../../apps/mobile/config/release.example.json', import.meta.url)),
);
const pin = 'A'.repeat(64),
  identity = 'B'.repeat(40),
  team = 'ABCDE12345';
function config() {
  const c = structuredClone(sample);
  c.apiBaseUrl = 'https://ledger.company.cn/api/v1';
  c.android.certificateSha256 = pin;
  c.ios = { ...c.ios, certificateSha256: pin, identitySha1: identity, teamId: team };
  return c;
}
function certificate() {
  return {
    sha256: pin,
    subject: 'CN=Release test fixture',
    validFrom: '2020-01-01',
    validTo: '2099-01-01',
  };
}
function ios() {
  const entitlements = {
    'get-task-allow': false,
    'application-identifier': team + '.' + sample.bundleId,
    'com.apple.developer.team-identifier': team,
  };
  return {
    platform: 'iphoneos',
    bundleId: sample.bundleId,
    version: sample.ios.version,
    buildNumber: '1',
    teamId: team,
    authorities: ['Apple Distribution: test fixture'],
    certificate: certificate(),
    entitlements,
    profileCertificateHashes: [pin],
    profile: {
      UUID: '11111111-1111-4111-8111-111111111111',
      Platform: ['iOS'],
      TeamIdentifier: [team],
      ApplicationIdentifierPrefix: [team],
      ExpirationDate: '2099-01-01',
      ProvisionedDevices: ['fixture-device'],
      Entitlements: { ...entitlements },
    },
  };
}
test('空签名模板只能准备候选；正式输入缺失时列出条件', () => {
  assert.equal(validateConfig(sample), sample);
  assert(signingNeeds(sample, 'android', {}).includes('certificateSha256'));
  assert(signingNeeds(sample, 'ios', {}).includes('IOS_PROVISIONING_PROFILE'));
  assert.throws(() => requireDeviceApi(sample));
});
test('配置拒绝秘密字段、错误协议、模拟器地址和不支持的渠道', () => {
  for (const change of [
    (c) => {
      c.password = 'fixture';
    },
    (c) => {
      c.apiBaseUrl = 'http://api.company.cn/api/v1';
    },
    (c) => {
      c.ios.distribution = 'upload';
    },
  ]) {
    const c = config();
    change(c);
    assert.throws(() => validateConfig(c));
  }
  const c = config();
  c.apiBaseUrl = 'https://10.0.2.2/api/v1';
  assert.throws(() => requireDeviceApi(c));
});
test('Android 固定证书及身份可通过；debug、错版本、错指纹与过期均拒绝', () => {
  const c = config(),
    valid = {
      certificate: certificate(),
      bundleId: c.bundleId,
      versionName: '0.1.0',
      versionCode: 1,
      debuggable: false,
    };
  assert.equal(verifyAndroidMetadata(valid, c).bundleId, c.bundleId);
  for (const change of [
    (v) => {
      v.certificate.subject = 'CN=Android Debug';
    },
    (v) => {
      v.debuggable = true;
    },
    (v) => {
      v.versionCode = 2;
    },
    (v) => {
      v.certificate.sha256 = 'C'.repeat(64);
    },
    (v) => {
      v.certificate.validTo = '2000-01-01';
    },
  ]) {
    const v = structuredClone(valid);
    change(v);
    assert.throws(() => verifyAndroidMetadata(v, c));
  }
});
test('iOS 正向元数据与 Ad Hoc 绑定通过；关键签名范围逐项拒绝', () => {
  assert.equal(verifyIosMetadata(ios(), config()).teamId, team);
  const changes = [
    (v) => {
      v.platform = 'iphonesimulator';
    },
    (v) => {
      v.teamId = 'WRONG12345';
    },
    (v) => {
      v.profile.ExpirationDate = '2000-01-01';
    },
    (v) => {
      v.profile.Entitlements['get-task-allow'] = true;
    },
    (v) => {
      v.entitlements['get-task-allow'] = true;
    },
    (v) => {
      v.profile.Entitlements['application-identifier'] = team + '.*';
    },
    (v) => {
      v.profileCertificateHashes = [];
    },
    (v) => {
      v.profile.ProvisionsAllDevices = true;
    },
    (v) => {
      v.profile.ProvisionedDevices = [];
    },
    (v) => {
      v.authorities = ['Apple Development: fixture'];
    },
    (v) => {
      v.certificate.sha256 = 'C'.repeat(64);
    },
  ];
  for (const change of changes) {
    const v = ios();
    change(v);
    assert.throws(() => verifyIosMetadata(v, config()));
  }
});
test('App Store profile 不接受 Ad Hoc 设备绑定；导出始终是本地 export', () => {
  const c = config();
  c.ios.distribution = 'app-store';
  const v = ios();
  delete v.profile.ProvisionedDevices;
  assert.equal(verifyIosMetadata(v, c).profile, v.profile.UUID);
  const options = exportOptions(c, v.profile);
  assert.equal(options.method, 'app-store-connect');
  assert.equal(options.destination, 'export');
  assert.equal(options.uploadSymbols, false);
  assert.equal(options.manageAppVersionAndBuildNumber, false);
});
test('未签名与正式构建命令隔离，不包含上传或自动登记参数', () => {
  const c = config(),
    android = androidBuild('/repo', c, false);
  assert(android.args.includes('-PmobileReleaseUnsigned=true'));
  assert(!androidBuild('/repo', c, true).args.includes('-PmobileReleaseUnsigned=true'));
  const unsigned = iosBuild('/repo', c, false, '/out');
  assert(unsigned.args.includes('CODE_SIGNING_ALLOWED=NO'));
  const signed = iosBuild('/repo', c, true, '/out', ios().profile);
  assert(signed.args.includes('MOBILE_RELEASE_SIGNING_STYLE=Manual'));
  assert(
    !signed.args.some((a) =>
      /^(MARKETING_VERSION|CURRENT_PROJECT_VERSION|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER|DEVELOPMENT_TEAM)=/.test(
        a,
      ),
    ),
  );
  assert(!signed.args.includes('-allowProvisioningUpdates'));
  assert(!signed.args.some((a) => /upload|submit|distribute/i.test(a)));
});
test('签名密码不进入日志，plist 日期和证书二进制可无凭据解析', () => {
  assert.equal(
    redact('one secret-two', {
      ANDROID_KEYSTORE_PASSWORD: 'one',
      ANDROID_KEY_PASSWORD: 'secret-two',
    }),
    '[隐藏] [隐藏]',
  );
  const data = plistData(
    '<?xml version="1.0"?><plist version="1.0"><dict><key>date</key><date>2099-01-01T00:00:00Z</date><key>cert</key><data>YQ==</data></dict></plist>',
  );
  assert.equal(data.cert, 'YQ==');
  assert.match(data.date, /^2099-/);
});
