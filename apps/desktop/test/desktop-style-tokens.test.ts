import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const components = readdirSync(source, { withFileTypes: true, recursive: true })
  .filter((file) => file.isFile() && file.name.endsWith('.tsx') && !file.name.endsWith('.test.tsx'))
  .map((file) => join(file.parentPath, file.name));

describe('桌面端间距与字号', () => {
  it('组件字号引用主题尺度', () => {
    const arbitrarySizes = components.filter((path) =>
      /\btext-\[(?:\d*\.)?\d+(?:px|rem|em)\]/.test(readFileSync(path, 'utf8')),
    );
    expect(arbitrarySizes.map((path) => relative(source, path))).toEqual([]);
  });

  it('横向页签栏到面板的间距由共享组件负责', () => {
    const extraSpacing: string[] = [];
    const spacingByTag: Record<string, RegExp> = {
      Tabs: /\b(?:gap(?:-y)?|space-y)-/,
      TabsList: /\b(?:mb|my|pb|py)-/,
      TabsContent: /\b(?:mt|my|pt|py)-/,
    };
    for (const path of components) {
      const code = readFileSync(path, 'utf8');
      if (!code.includes('<Tabs')) continue;
      const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function inspect(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const spacing = spacingByTag[node.tagName.getText(file)];
          if (spacing) {
            const attribute = node.attributes.properties.find(
              (prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === 'className',
            );
            if (attribute && spacing.test(attribute.getText(file))) {
              extraSpacing.push(relative(source, path) + ': ' + attribute.getText(file));
            }
          }
        }
        ts.forEachChild(node, inspect);
      }
      inspect(file);
    }
    expect(extraSpacing).toEqual([]);
  });
});
