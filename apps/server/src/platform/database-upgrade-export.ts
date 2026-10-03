import { discoverDatabaseStructure } from './database-structure.js';

// 官方更新入口在待部署镜像内调用，供宿主机演练绑定实际镜像的结构输入。
discoverDatabaseStructure().then((input) => process.stdout.write(JSON.stringify(input))).catch(() => {
  process.stderr.write('无法读取镜像数据库结构输入\n');
  process.exitCode = 1;
});
