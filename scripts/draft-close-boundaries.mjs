import ts from 'typescript';

function hasInvalidGuardInput(file, source, hook, invalidInput) {
  if (!file.startsWith('apps/desktop/src/') || !source.includes(hook)) return false;
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let invalid = false;
  const visit = (node) => {
    if (invalid) return;
    if (ts.isCallExpression(node)) {
      const called = node.expression;
      const name = ts.isIdentifier(called)
        ? called.text
        : ts.isPropertyAccessExpression(called) && called.name.text;
      const input = node.arguments[0];
      if (name === hook && input && ts.isObjectLiteralExpression(input)) {
        invalid = invalidInput(input);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  return invalid;
}

function propertyNamed(input, name) {
  return input.properties.find(
    (property) =>
      property.name &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  );
}

export function draftCloseSnapshotBoundaryViolation(file, source) {
  const invalid = hasInvalidGuardInput(file, source, 'useDraftCloseGuard', (input) => {
    const draft = propertyNamed(input, 'draft');
    return (
      draft &&
      ts.isPropertyAssignment(draft) &&
      draft.initializer.kind === ts.SyntaxKind.NullKeyword
    );
  });
  return invalid ? '关闭确认必须传递实际草稿快照，dirty 不能替代内容和业务身份' : null;
}

export function navigationDraftSnapshotBoundaryViolation(file, source) {
  const invalid = hasInvalidGuardInput(file, source, 'useNavigationGuard', (input) => {
    const dirty = propertyNamed(input, 'dirty');
    if (
      dirty &&
      ts.isPropertyAssignment(dirty) &&
      dirty.initializer.kind === ts.SyntaxKind.FalseKeyword
    )
      return false;
    const draft = propertyNamed(input, 'draft');
    return (
      !draft ||
      (ts.isPropertyAssignment(draft) && draft.initializer.kind === ts.SyntaxKind.NullKeyword)
    );
  });
  return invalid ? '导航草稿保护必须登记内容或编辑版本；纯忙碌入口应显式使用 dirty: false' : null;
}
