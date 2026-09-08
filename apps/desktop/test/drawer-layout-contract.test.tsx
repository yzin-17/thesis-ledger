import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SheetHeader, SheetFooter } from '../src/components/ui/sheet.js';

const featureRoot = fileURLToPath(new URL('../src/features', import.meta.url));
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('Drawer 布局统一契约', () => {
  it('所有侧栏标题都由共享标题区管理，调用方不重新加标题边框或内边距', () => {
    const violations: string[] = [];
    let titleCount = 0;
    for (const path of sourceFiles(featureRoot)) {
      const text = readFileSync(path, 'utf8');
      if (!text.includes('<SheetTitle')) continue;
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node)) {
          const tag = node.openingElement.tagName.getText(source);
          if (tag === 'SheetTitle') {
            titleCount += 1;
            const parent = node.parent;
            if (
              !ts.isJsxElement(parent) ||
              parent.openingElement.tagName.getText(source) !== 'SheetHeader'
            ) {
              violations.push(`${path}: 标题没有使用 SheetHeader`);
            }
          }
          if (tag === 'SheetHeader') {
            const opening = node.openingElement.getText(source);
            if (/\b(?:panel-heading|border-[a-z]+|p[xytrbl]?-\d+)\b/.test(opening)) {
              violations.push(`${path}: 标题区覆盖共享留白或边框`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      if (/\bform-card\b/.test(text)) violations.push(`${path}: 侧栏仍套用整块表单外框`);
    }
    expect(titleCount).toBeGreaterThanOrEqual(25);
    expect(violations).toEqual([]);
  });

  it('共享标题保持 8px 间隔，操作区使用单条顶线并允许按钮换行', () => {
    const header = renderToStaticMarkup(<SheetHeader>标题与说明</SheetHeader>);
    const footer = renderToStaticMarkup(<SheetFooter>操作</SheetFooter>);
    expect(header).toContain('gap-2');
    expect(header).not.toContain('p-4');
    expect(footer).toContain('border-t border-border pt-4');
    expect(footer).toContain('flex-wrap');
    expect(footer).toContain('justify-end');
  });
});
