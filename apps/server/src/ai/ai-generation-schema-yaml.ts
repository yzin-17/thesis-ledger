import { Document, Lexer, Scalar, visit } from 'yaml';

/** Lexer区分分隔符与标量；只移除flow逗号后的排版空白，字符串内容不变。 */
function compactFlowSeparators(source: string): string {
  let result = '',
    previous = '';
  const tokens = [...new Lexer().lex(source)].filter(
    (token) => token !== '\x02' && token !== '\x1f',
  );
  for (const [index, token] of tokens.entries()) {
    if (token === '\x18') throw new Error('生成的YAML flow结构无效');
    if (previous === ',' && /^ +$/.test(token)) continue;
    if (previous === ':' && /^ +$/.test(token) && ['[', '{'].includes(tokens[index + 1]!)) continue;
    result += token;
    previous = token;
  }
  return result;
}

/** 标准 YAML 锚点同时复用重复对象和长键；解析后仍是原来的完整 Schema。 */
export function compactGenerationYaml(value: unknown): string {
  const document = new Document(value);
  visit(document, {
    Collection: (_key, node) => {
      node.flow = true;
    },
  });
  const counts = new Map<string, number>();
  const anchoredParent = (path: readonly unknown[]) =>
    path.some(
      (parent) => parent && typeof parent === 'object' && 'anchor' in parent && parent.anchor,
    );
  visit(document, {
    Scalar: (_key, node, path) => {
      if (typeof node.value === 'string' && /[\r\n]/.test(node.value))
        node.type = Scalar.QUOTE_DOUBLE;
      if (anchoredParent(path)) return;
      if (typeof node.value === 'string') counts.set(node.value, (counts.get(node.value) ?? 0) + 1);
    },
  });
  const seen = new Map<string, { node: Scalar; uses: number }>();
  let ordinal = 0;
  visit(document, {
    Scalar: (_key, node, path) => {
      if (anchoredParent(path)) return;
      if (typeof node.value !== 'string') return;
      const count = counts.get(node.value) ?? 0;
      if ((node.value.length - 5) * count <= 8) return;
      const previous = seen.get(node.value);
      if (previous && previous.uses < 48) {
        previous.uses++;
        return document.createAlias(previous.node);
      }
      node.anchor = 's' + (ordinal++).toString(36);
      seen.set(node.value, { node, uses: 1 });
    },
  });
  // 全部集合为 flow，含换行的标量强制双引号转义；这里只移除布局换行。
  return compactFlowSeparators(
    document
      .toString({ flowCollectionPadding: false, lineWidth: 0, singleQuote: true })
      .trimEnd()
      .replace(/\n[ \t]*/g, ' '),
  );
}
