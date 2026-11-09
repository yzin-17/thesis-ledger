import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('全部 Desktop 列标题使用共享表头，不在消费者重建视觉默认值', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const violations: string[] = [];
  for (const file of readdirSync(root, { recursive: true }).filter(
    (path) => typeof path === 'string' && path.endsWith('.tsx'),
  )) {
    if (file === 'components/ui/table.tsx') continue;
    const path = join(root, String(file));
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        if (tag === 'thead' || tag === 'th') violations.push(`${file}: 原生 ${tag}`);
        if (['TableHeader', 'TableHead', 'StickyTableActionHeader'].includes(tag)) {
          const classes = node.attributes.properties.find(
            (attribute) =>
              ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'className',
          );
          if (
            classes &&
            /(?:\b(?:bg-|p[xy]?-|font-|text-(?:xs|sm|foreground|muted-foreground)))/.test(
              classes.getText(source),
            )
          ) {
            violations.push(`${file}: ${tag} 重复定义表头样式`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations).toEqual([]);
});
