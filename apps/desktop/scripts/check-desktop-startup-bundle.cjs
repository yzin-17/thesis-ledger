const fs = require('node:fs/promises');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const ts = require('typescript');

async function measureBundle(directory) {
  const root = path.resolve(directory);
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const entry = html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/u)?.[1];
  if (!entry) throw new Error('生产页面缺少 Module 入口');
  const seeds = [entry];
  for (const match of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/gu)) {
    seeds.push(match[1]);
  }
  const pending = seeds.map((url) => path.join(root, url.replace(/^\//u, '')));
  const seen = new Set();
  const files = [];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    if (!file.startsWith(root + path.sep)) throw new Error('静态依赖越出资源目录');
    seen.add(file);
    const bytes = await fs.readFile(file);
    const source = ts.createSourceFile(file, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      const dependency =
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
          ? statement.moduleSpecifier
          : undefined;
      if (!dependency || !ts.isStringLiteral(dependency)) continue;
      const specifier = dependency.text;
      if (!specifier.startsWith('.')) throw new Error(`生产资源存在未打包依赖：${specifier}`);
      pending.push(path.resolve(path.dirname(file), specifier));
    }
    files.push({
      file: path.relative(root, file),
      bytes: bytes.length,
      gzip: gzipSync(bytes).length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  files.sort((left, right) => left.file.localeCompare(right.file));
  return {
    entry,
    entryBytes: files.find((file) => file.file === entry.replace(/^\//u, ''))?.bytes,
    staticBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    staticGzip: files.reduce((sum, file) => sum + file.gzip, 0),
    files,
  };
}

async function main() {
  const [beforeDirectory, afterDirectory, output] = process.argv.slice(2);
  if (!beforeDirectory || !afterDirectory || !output) {
    throw new Error('用法：node check-desktop-startup-bundle.cjs <基线目录> <当前目录> <输出JSON>');
  }
  const before = await measureBundle(beforeDirectory);
  const after = await measureBundle(afterDirectory);
  const reduction = 1 - after.staticBytes / before.staticBytes;
  const result = { before, after, staticReduction: reduction };
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      beforeBytes: before.staticBytes,
      afterBytes: after.staticBytes,
      reductionPercent: Number((reduction * 100).toFixed(2)),
      staticFiles: after.files.length,
    }),
  );
  if (reduction < 0.3) throw new Error('入口静态依赖总量缩减未达到 30%');
}

module.exports = { measureBundle };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
