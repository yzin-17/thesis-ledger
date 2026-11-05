import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card, CardContent } from '../src/components/ui/card.js';
import {
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableRow,
} from '../src/components/ui/table.js';

const sourceRoot = fileURLToPath(new URL('../src/features', import.meta.url));
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return path.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
  });

describe('列表边框所有权', () => {
  it('独立表格使用一个带框且可滚动的容器，属性仍属于 table', () => {
    const html = renderToStaticMarkup(
      <Table aria-label="成交列表" className="min-w-[900px]">
        <TableBody>
          <TableRow>
            <TableCell>成交</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(html).toContain('data-frame="outlined"');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('rounded-md border border-border');
    expect(html.match(/data-slot="table-container"/g)).toHaveLength(1);
    expect(html.match(/<table[^>]+aria-label="成交列表"/)).not.toBeNull();
    expect(html).not.toContain('<table frame=');
  });

  it('卡片承担边框时，内部表格显式 plain 且不增加第二个容器边框', () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardContent>
          <Table frame="plain">
            <TableBody>
              <TableRow>
                <TableCell>结果</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>,
    );
    const container = html.match(/<div[^>]*data-slot="table-container"[^>]*>/)?.[0];
    expect(container).toContain('data-frame="plain"');
    expect(container).toContain('overflow-x-auto');
    expect(container).not.toContain('border');
    expect(html.match(/rounded-md border border-border/g)).toHaveLength(1);
  });

  it('原生表格复用相同容器，容器的名称、宽度和事件属性可以组合', () => {
    const html = renderToStaticMarkup(
      <TableContainer aria-label="批次明细" className="mt-2">
        <table>
          <tbody>
            <tr>
              <td>批次</td>
            </tr>
          </tbody>
        </table>
      </TableContainer>,
    );
    expect(html).toContain('aria-label="批次明细"');
    expect(html).toContain('data-frame="outlined"');
    expect(html).toContain('mt-2');
    expect(html).toContain('rounded-md border border-border');
  });

  it('每个原生业务表格都声明共享容器或具有实际边框的复合所有者', () => {
    const violations: string[] = [];
    for (const path of files(sourceRoot)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'table') {
          let parent: ts.Node | undefined = node.parent;
          let owned = false;
          while (parent) {
            if (ts.isJsxElement(parent)) {
              if (parent.openingElement.tagName.getText(source) === 'TableContainer') {
                owned = true;
                break;
              }
              const attributes = parent.openingElement.attributes.getText(source);
              if (
                attributes.includes('data-list-frame="composite"') &&
                /rounded-md border border-border/.test(attributes)
              ) {
                owned = true;
                break;
              }
            }
            parent = parent.parent;
          }
          if (!owned) violations.push(path);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
