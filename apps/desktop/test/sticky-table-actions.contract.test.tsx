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
import { TableCell, TableHead } from '../src/components/ui/table.js';
import { staticTableActionContext } from './table-action-source-context.js';

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
          const row = node.parent;
          const lastInRow =
            ts.isJsxElement(row) &&
            /^(tr|TableRow)$/.test(row.openingElement.tagName.getText(source)) &&
            row.children.filter(ts.isJsxElement).at(-1) === node;
          if (
            (tag === 'th' || tag === 'TableHead') &&
            lastInRow &&
            /操作|调整|选择/.test(node.getText(source)) &&
            !attributes.includes('data-table-action-static')
          ) {
            violations.push(path);
          }
          if ((tag === 'td' || tag === 'TableCell') && !attributes.includes('colSpan')) {
            if (lastInRow) {
              const staticActions = staticTableActionContext(node, source);
              if (
                /onClick=|<Link\b|<DropdownMenuTrigger\b/.test(node.getText(source)) &&
                !staticActions
              )
                violations.push(path);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('私有行组件只在全部宿主表格声明静态操作列时继承例外', () => {
    const audit = (hosts: string) => {
      const source = ts.createSourceFile(
        'sample.tsx',
        `function Row() { return <tr><td><button onClick={go}>操作</button></td></tr>; } ${hosts}`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      let cell: ts.Node | undefined;
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'td')
          cell = node;
        ts.forEachChild(node, visit);
      };
      visit(source);
      return staticTableActionContext(cell!, source);
    };
    expect(
      audit('function Page() { return <table data-table-action-static><Row /></table>; }'),
    ).toBe(true);
    expect(audit('function Page() { return <table><Row /></table>; }')).toBe(false);
    expect(
      audit(
        'function Page() { return <><table data-table-action-static><Row /></table><table><Row /></table></>; }',
      ),
    ).toBe(false);
    expect(audit('')).toBe(false);
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
    expect(header).toContain('text-right');
    expect(cell).toContain('data-sticky-table-action="cell"');
    expect(cell).toContain('sticky');
    expect(cell).toContain('right-0');
    expect(cell).toContain('bg-background');
    expect(cell).toContain('before:w-px');
    expect(cell).toContain('before:bg-border');
    expect(cell).toContain('text-right');
  });

  it('共享文字列默认方向相同，数字列可以同时覆盖表头和内容', () => {
    for (const Component of [TableHead, TableCell]) {
      const textColumn = renderToStaticMarkup(<Component>状态</Component>);
      const numberColumn = renderToStaticMarkup(<Component className="text-right">数量</Component>);
      expect(textColumn).toContain('text-left');
      expect(numberColumn).toContain('text-right');
      expect(numberColumn).not.toContain('text-left');
    }
  });
});
