import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function paths(node: ts.Expression | undefined): string[] {
  if (!node) return [''];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(paths);
  throw new Error(`无法核对动态 Controller 路径：${node.getText()}`);
}

function decorators(node: ts.Node) {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).flatMap((decorator) =>
    ts.isCallExpression(decorator.expression) ? [decorator.expression] : []);
}

export function apiRouteInventory(directory: string): string[] {
  const result: string[] = [];
  const verbs = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'All', 'Sse']);
  for (const file of sourceFiles(directory)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      const controller = decorators(node).find((item) => item.expression.getText(source) === 'Controller');
      if (!controller) return;
      for (const member of node.members) {
        for (const decorator of decorators(member)) {
          const verb = decorator.expression.getText(source);
          if (!verbs.has(verb)) continue;
          for (const prefix of paths(controller.arguments[0])) {
            for (const suffix of paths(decorator.arguments[0])) {
              const route = `/${[prefix, suffix].filter(Boolean).join('/')}`;
              const path = route.startsWith('/api/market') ? route : `/api/v1${route}`;
              result.push(`${verb === 'Sse' ? 'GET' : verb.toUpperCase()} ${path}`);
            }
          }
        }
      }
    });
  }
  return result;
}
