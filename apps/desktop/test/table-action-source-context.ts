import ts from 'typescript';

/** 跟随本文件私有行组件的所有调用处，核对真实宿主表格的静态操作列声明。 */
export function staticTableActionContext(
  node: ts.Node,
  source: ts.SourceFile,
  visited = new Set<ts.Node>(),
): boolean {
  if (visited.has(node)) return false;
  const nextVisited = new Set(visited).add(node);
  let owner: ts.Node | undefined = node;
  while (owner) {
    if (
      ts.isJsxElement(owner) &&
      /^(table|Table)$/.test(owner.openingElement.tagName.getText(source))
    )
      return owner.getText(source).includes('data-table-action-static');
    if (ts.isFunctionDeclaration(owner) && owner.name) break;
    owner = owner.parent;
  }
  if (!owner || !ts.isFunctionDeclaration(owner) || !owner.name) return false;
  const name = owner.name.text;
  const callers: ts.Node[] = [];
  const visit = (candidate: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(candidate) || ts.isJsxSelfClosingElement(candidate)) &&
      candidate.tagName.getText(source) === name
    )
      callers.push(candidate);
    ts.forEachChild(candidate, visit);
  };
  visit(source);
  return (
    callers.length > 0 &&
    callers.every((caller) => staticTableActionContext(caller, source, nextVisited))
  );
}
