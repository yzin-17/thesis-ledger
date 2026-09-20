import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  StickyTableActionCell,
  StickyTableActionHeader,
} from '../src/features/shared/StickyTableActions.js';

const featureRoot = fileURLToPath(new URL('../src/features', import.meta.url));

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });

describe('表格操作列统一契约', () => {
  it('操作列默认使用共享 sticky 语义组件，明确采用静态窄列的列表必须声明例外', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(featureRoot)) {
      const text = readFileSync(path, 'utf8');
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
          const attributes = node.openingElement.attributes.getText(source);
          if (
            tag === 'th' &&
            /操作|调整/.test(node.getText(source)) &&
            !attributes.includes('data-table-action-static')
          ) {
            violations.push(path);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('共享表头和单元格都固定在右侧，具备不透底背景与左边界', () => {
    const header = renderToStaticMarkup(<StickyTableActionHeader>操作</StickyTableActionHeader>);
    const cell = renderToStaticMarkup(<StickyTableActionCell>查看</StickyTableActionCell>);

    expect(header).toContain('data-sticky-table-action="header"');
    expect(header).toContain('sticky');
    expect(header).toContain('right-0');
    expect(header).toContain('bg-muted');
    expect(header).toContain('before:w-px');
    expect(header).toContain('before:bg-border');
    expect(cell).toContain('data-sticky-table-action="cell"');
    expect(cell).toContain('sticky');
    expect(cell).toContain('right-0');
    expect(cell).toContain('bg-background');
    expect(cell).toContain('before:w-px');
    expect(cell).toContain('before:bg-border');
  });
});
