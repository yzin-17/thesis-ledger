import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export const fileHash = (file) => sha256(readFileSync(file));
export function redact(text, env = process.env) {
  let result = String(text);
  for (const key of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_PASSWORD'])
    if (env[key]) result = result.replaceAll(env[key], '[隐藏]');
  return result;
}
export function run(binary, args, options = {}) {
  const { cwd, env = process.env, log, input, timeout = 30 * 60 * 1000 } = options;
  const result = spawnSync(binary, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = redact((result.stdout ?? '') + (result.stderr ?? ''), env);
  if (log) appendFileSync(log, text);
  if (result.status !== 0)
    throw Error(
      '工具执行失败：' +
        binary +
        '，退出码 ' +
        (result.status ?? 'unknown') +
        '；' +
        redact(result.error?.message ?? text.slice(-900), env),
    );
  if (options.combined) return (result.stdout ?? '') + (result.stderr ?? '');
  return result.stdout ?? '';
}
const plistDecoder = `import sys,plistlib,json,datetime,base64
def convert(v):
 if isinstance(v,bytes): return base64.b64encode(v).decode('ascii')
 if isinstance(v,datetime.datetime): return v.isoformat()+'Z'
 if isinstance(v,dict): return {k:convert(x) for k,x in v.items()}
 if isinstance(v,list): return [convert(x) for x in v]
 return v
print(json.dumps(convert(plistlib.loads(sys.stdin.buffer.read()))))`;
export function plistData(data, options = {}) {
  return JSON.parse(run('python3', ['-c', plistDecoder], { ...options, input: data }));
}
export function plistJson(file, options = {}) {
  return plistData(readFileSync(file), options);
}
export function decodeProfile(file, options = {}) {
  const xml = run('/usr/bin/security', ['cms', '-D', '-i', file], options);
  return plistData(xml, options);
}
export function runBuild(command, options) {
  return new Promise((resolve, reject) => {
    const env = options.env ?? process.env;
    const child = spawn(command.binary, command.args, {
      cwd: command.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    console.log(JSON.stringify({ action: '本机编译', pid: child.pid, log: options.log }));
    let stdout = '',
      stderr = '',
      tail = '';
    const flush = (text) => {
      const clean = redact(text, env);
      appendFileSync(options.log, clean);
      tail = (tail + clean).slice(-1800);
    };
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const at = stdout.lastIndexOf('\n');
      if (at >= 0) {
        flush(stdout.slice(0, at + 1));
        stdout = stdout.slice(at + 1);
      }
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      const at = stderr.lastIndexOf('\n');
      if (at >= 0) {
        flush(stderr.slice(0, at + 1));
        stderr = stderr.slice(at + 1);
      }
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(Error('编译工具无法启动：' + redact(error.message, env)));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      flush(stdout + stderr);
      if (code === 0) resolve();
      else reject(Error('本机编译失败，退出码 ' + code + '；' + tail));
    });
  });
}
