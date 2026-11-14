import { readFileSync } from 'node:fs';

const [directory, user, command] = readFileSync(0, 'utf8').trimEnd().split('\n');
if (directory !== '/app' || user !== 'thesis' || command !== '["node","apps/server/dist/src/main.js"]') {
  process.stderr.write('Server 镜像运行形态不匹配\n');
  process.exitCode = 1;
}
