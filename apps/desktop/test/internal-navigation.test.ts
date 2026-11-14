import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function literalPrefix(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isJsxExpression(node)) return literalPrefix(node.expression);
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
    return literalPrefix(node.expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text || undefined;
  return undefined;
}
function applicationPath(value: string | undefined) {
  if (!value?.trim()) return false;
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/api(?:\/|$))/i.test(value.trim());
}
function jsxNavigationReasons(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  source: ts.SourceFile,
): string[] {
  const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
  const attr = (name: string) => attrs.find((value) => value.name.getText(source) === name);
  const target = literalPrefix(attr('target')?.initializer);
  if ((target !== undefined && target !== '_self') || attr('download')) return [];
  const reasons: string[] = [];
  if (
    node.tagName.getText(source) === 'a' &&
    applicationPath(literalPrefix(attr('href')?.initializer))
  )
    reasons.push('应用内部链接须使用 React Router');
  const reload = attr('reloadDocument');
  const disabled =
    reload?.initializer &&
    ts.isJsxExpression(reload.initializer) &&
    reload.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword;
  if (reload && !disabled && applicationPath(literalPrefix(attr('to')?.initializer)))
    reasons.push('应用内部链接不得开启 reloadDocument');
  return reasons;
}
function navigationViolations(file: string, text: string) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const issues: string[] = [];
  const report = (node: ts.Node, reason: string) =>
    issues.push(
      `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${reason}`,
    );
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const reason of jsxNavigationReasons(node, source)) report(node, reason);
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (
        /^(?:(?:window|document|globalThis)\.)?location\.(?:assign|replace)$/.test(name) &&
        applicationPath(literalPrefix(node.arguments[0]))
      )
        report(node, '应用内部跳转须使用 navigate');
      if (
        /^(?:(?:window|document|globalThis)\.)?location\.reload$/.test(name) &&
        file !== 'apps/desktop/src/app/DeferredPage.tsx'
      )
        report(node, '整页刷新须核对明确的错误恢复用途');
      if (
        name === 'window.open' &&
        ['_self', '_top', '_parent'].includes(literalPrefix(node.arguments[1]) ?? '') &&
        applicationPath(literalPrefix(node.arguments[0]))
      )
        report(node, '当前页面的内部跳转须使用 navigate');
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = node.left.getText(source);
      if (
        /^(?:(?:window|document|globalThis)\.)?location(?:\.(?:href|pathname|search))?$/.test(
          target,
        ) &&
        applicationPath(literalPrefix(node.right))
      )
        report(node, '应用内部跳转不得写入 location');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    const path = join(root, item.name);
    if (item.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(item.name) && !item.name.includes('.test.') ? [path] : [];
  });
}

describe('普通内部导航的文档刷新回归检查', () => {
  it.each([
    '<a href="/providers">配置</a>',
    '<a href={"?tab=automation"}>任务</a>',
    '<a href={`/journal?accountId=${id}`}>复盘</a>',
    'window.location.assign("/providers")',
    'location.replace("./providers")',
    'window.location.href = "/journal"',
    'window.open("/journal", "_self")',
    '<Link to="/providers" reloadDocument />',
    'window.location.reload()',
  ])('识别会替换当前文档的入口：%s', (source) => {
    expect(navigationViolations('sample.tsx', source)).not.toEqual([]);
  });
  it.each([
    '<Link to="/providers" />',
    '<NavLink to="/journal" reloadDocument={false} />',
    '<a href="https://example.com">外部资料</a>',
    '<a href="/journal" target="_blank">另开页面</a>',
    '<a href="./report.csv" download>下载</a>',
    '<a href="/api/v1/exports/account">导出</a>',
    '<a href="#evidence">证据</a>',
    'window.open(url, "_blank", "noopener,noreferrer")',
    'anchor.href = URL.createObjectURL(blob)',
  ])('保留路由、外部资料、下载和页内链接：%s', (source) => {
    expect(navigationViolations('sample.tsx', source)).toEqual([]);
  });
  it('只在既有错误恢复页面保留显式重新加载', () => {
    expect(
      navigationViolations('apps/desktop/src/app/DeferredPage.tsx', 'window.location.reload()'),
    ).toEqual([]);
  });
  it('Desktop及共享生产源码不存在遗漏的静态内部文档导航', () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const packages = readdirSync(join(repo, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repo, 'packages', entry.name, 'src'))
      .filter(existsSync);
    const files = [join(repo, 'apps/desktop/src'), ...packages].flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(0);
    const issues = files.flatMap((file) =>
      navigationViolations(relative(repo, file), readFileSync(file, 'utf8')),
    );
    expect(issues).toEqual([]);
  });
});
