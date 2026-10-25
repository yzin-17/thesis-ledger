import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  readlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, signingNeeds } from './mobile-release/config.mjs';
import { run, runBuild, fileHash, sha256, redact } from './mobile-release/process.mjs';
import {
  androidBuild,
  androidArtifact,
  preflightAndroid,
  verifyAndroid,
  verifyUnsignedAndroid,
} from './mobile-release/android.mjs';
import {
  iosBuild,
  preflightIos,
  verifyIos,
  verifyUnsignedIos,
  exportOptions,
} from './mobile-release/ios.mjs';
import { sourceProvenance } from './mobile-release/provenance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function parse(argv) {
  const [action, platform, ...rest] = argv;
  if (!['plan', 'build', 'verify'].includes(action) || !['android', 'ios'].includes(platform))
    throw Error(
      '用法：node scripts/mobile-release.mjs plan|build|verify android|ios --config 文件 [--unsigned|--signed] [--out 新目录] [--artifact 文件]',
    );
  const result = { action, platform };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--signed' || arg === '--unsigned') {
      if (result.mode) throw Error('只能选择一种签名模式');
      result.mode = arg.slice(2);
    } else if (['--config', '--out', '--artifact', '--derived-data'].includes(arg)) {
      if (!rest[i + 1] || rest[i + 1].startsWith('--') || result[arg.slice(2)])
        throw Error('发布参数缺失或重复');
      result[arg.slice(2)] = path.resolve(rest[++i]);
    } else throw Error('存在不支持的发布参数');
  }
  if (
    !result.config ||
    (action === 'build' && (!result.mode || !result.out)) ||
    (action === 'verify' && !result.artifact)
  )
    throw Error('缺少配置、显式构建模式、独立输出目录或待验产物');
  if (result['derived-data'] && (action !== 'build' || platform !== 'ios'))
    throw Error('derived-data 仅用于 iOS 构建缓存接续');
  return result;
}
function manifestHash(dir) {
  const rows = [];
  function walk(base, prefix = '') {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      const relative = prefix + e.name,
        file = path.join(base, e.name);
      if (e.isDirectory()) walk(file, relative + '/');
      else if (e.isFile()) rows.push({ file: relative, sha256: fileHash(file) });
      else if (e.isSymbolicLink()) rows.push({ file: relative, symlink: readlinkSync(file) });
    }
  }
  walk(dir);
  return {
    files: rows.length,
    sha256: sha256(JSON.stringify(rows.sort((a, b) => a.file.localeCompare(b.file)))),
  };
}
function buildEnvironment(config) {
  const env = {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: config.apiBaseUrl,
    NODE_ENV: 'production',
    EXPO_NO_TELEMETRY: '1',
    CI: '1',
  };
  for (const key of ['ANDROID_KEYSTORE_FILE', 'BUNDLETOOL_JAR', 'IOS_PROVISIONING_PROFILE'])
    if (env[key]) env[key] = path.resolve(env[key]);
  return env;
}
async function build(input, config) {
  const signed = input.mode === 'signed',
    env = buildEnvironment(config);
  const missing = signingNeeds(config, input.platform, env);
  if (signed && missing.length) throw Error('正式签名条件未就绪：' + missing.join(', '));
  if (!signed && input.platform === 'android' && config.android.format !== 'apk')
    throw Error('未签名候选请使用 APK 配置；AAB 签名/身份验收需独立接续');
  if (existsSync(input.out)) throw Error('输出目录已存在，拒绝覆盖旧产物');
  let profile;
  if (signed && input.platform === 'android') preflightAndroid(config, env);
  if (signed && input.platform === 'ios') profile = preflightIos(config, env);
  mkdirSync(input.out, { recursive: true });
  const record = {
    started: new Date().toISOString(),
    platform: input.platform,
    mode: input.mode,
    configSha256: fileHash(input.config),
    nativeCompilePassed: false,
    signingVerified: false,
    devicePassed: false,
    distributionPassed: false,
    completeMigrationPassed: false,
    source: sourceProvenance(root),
  };
  try {
    await runBuild(
      { binary: 'pnpm', args: ['--filter', '@thesis-ledger/mobile^...', 'build'], cwd: root },
      { env, log: path.join(input.out, 'dependencies.log') },
    );
    let command;
    if (input.platform === 'android') command = androidBuild(root, config, signed);
    else command = iosBuild(root, config, signed, input.out, profile, input['derived-data']);
    record.nativeCommand = command;
    await runBuild(command, { env, log: path.join(input.out, 'native.log') });
    record.nativeCompilePassed = true;
    let artifact;
    if (input.platform === 'android') {
      const generated = androidArtifact(root, config, signed);
      artifact = path.join(input.out, 'ThesisLedger-' + input.mode + '.' + config.android.format);
      copyFileSync(generated, artifact);
      if (signed) record.verification = verifyAndroid(artifact, config, { env });
      else record.unsignedVerification = verifyUnsignedAndroid(artifact, config, { env });
      record.artifact = { file: path.basename(artifact), sha256: fileHash(artifact) };
    } else {
      artifact = path.join(input.out, 'ThesisLedger.xcarchive');
      if (!signed) record.unsignedVerification = verifyUnsignedIos(artifact, config, { env });
      if (signed) {
        record.archiveVerification = verifyIos(artifact, config, { env });
        const options = path.join(input.out, 'ExportOptions.plist');
        run('/usr/bin/plutil', ['-convert', 'xml1', '-o', options, '-'], {
          env,
          input: JSON.stringify(exportOptions(config, profile)),
        });
        await runBuild(
          {
            binary: '/usr/bin/xcodebuild',
            args: [
              '-exportArchive',
              '-archivePath',
              artifact,
              '-exportPath',
              path.join(input.out, 'export'),
              '-exportOptionsPlist',
              options,
            ],
            cwd: root,
          },
          { env, log: path.join(input.out, 'export.log') },
        );
        const ipas = readdirSync(path.join(input.out, 'export')).filter((f) => f.endsWith('.ipa'));
        if (ipas.length !== 1) throw Error('导出必须生成一个 IPA');
        const ipa = path.join(input.out, 'export', ipas[0]);
        record.verification = verifyIos(ipa, config, { env });
        record.ipa = { file: path.relative(input.out, ipa), sha256: fileHash(ipa) };
      }
      record.artifact = { file: path.basename(artifact), ...manifestHash(artifact) };
    }
    const after = sourceProvenance(root);
    if (after.sourceFingerprint !== record.source.sourceFingerprint)
      throw Error('构建期间源码输入变化，保留产物但本轮验收失败');
    record.signingVerified = signed;
    record.status = signed
      ? '本机签名及校验通过，未验设备或分发'
      : '未签名原生编译通过，不能用于分发';
  } catch (error) {
    record.status = '失败';
    record.error = redact(error.message);
    throw error;
  } finally {
    record.finished = new Date().toISOString();
    writeFileSync(path.join(input.out, 'result.json'), JSON.stringify(record, null, 2));
  }
  return record;
}
try {
  const input = parse(process.argv.slice(2)),
    config = loadConfig(input.config);
  if (input.action === 'plan') {
    const missing = signingNeeds(config, input.platform);
    console.log(
      JSON.stringify(
        {
          platform: input.platform,
          stage: '计划',
          signingInputsPresent: missing.length === 0,
          preflightVerified: false,
          missing,
          unsignedPlanAvailable: true,
          distributionAvailable: false,
          note: '本命令不编译、签名、上传或分发；build 必须显式选择 unsigned 或 signed，并指定新输出目录。',
        },
        null,
        2,
      ),
    );
  } else if (input.action === 'build') {
    const result = await build(input, config);
    console.log(
      JSON.stringify({
        platform: result.platform,
        mode: result.mode,
        nativeCompilePassed: result.nativeCompilePassed,
        signingVerified: result.signingVerified,
        distributionPassed: false,
        status: result.status,
        result: path.join(input.out, 'result.json'),
        sourceFingerprint: result.source.sourceFingerprint,
      }),
    );
  } else {
    const result =
      input.platform === 'android'
        ? verifyAndroid(input.artifact, config)
        : verifyIos(input.artifact, config);
    console.log(
      JSON.stringify({
        platform: input.platform,
        stage: '产物签名校验',
        passed: true,
        verification: result,
        distributionPassed: false,
      }),
    );
  }
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 2;
}
