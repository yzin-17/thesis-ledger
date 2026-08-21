import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

const bindingNames = (name, out = []) => {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindingNames(element.name, out);
  return out;
};

const declaredNames = (statement) => {
  const names = [];
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, names);
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    names.push(statement.name.text);
  }
  return names;
};

const isReferenceIdentifier = (node) => {
  const parent = node.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent)) &&
    parent.name === node &&
    !ts.isComputedPropertyName(parent.name)
  )
    return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent)) &&
    parent.name === node
  )
    return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  if (ts.isTypeParameterDeclaration(parent) && parent.name === node) return false;
  if (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) return false;
  return true;
};

const references = (node) => {
  const refs = new Set();
  const visit = (current) => {
    if (ts.isIdentifier(current) && isReferenceIdentifier(current)) refs.add(current.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return refs;
};

const isDescribeStatement = (statement) => {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
  const callee = statement.expression.expression;
  return ts.isIdentifier(callee) && callee.text === 'describe';
};

const describeTitle = (statement) => {
  const first = statement.expression.arguments[0];
  return first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
    ? first.text
    : '';
};

const importLocalNames = (statement) => {
  const names = [];
  const clause = statement.importClause;
  if (!clause) return names;
  if (clause.name) names.push(clause.name.text);
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
  if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) names.push(element.name.text);
  return names;
};

const renderImport = (statement, needed, sourceFile) => {
  const clause = statement.importClause;
  if (!clause) return statement.getText(sourceFile);
  const defaultName = clause.name && needed.has(clause.name.text) ? clause.name : undefined;
  let namedBindings;
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    if (needed.has(clause.namedBindings.name.text)) namedBindings = clause.namedBindings;
  } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    const elements = clause.namedBindings.elements.filter((element) => needed.has(element.name.text));
    if (elements.length) namedBindings = ts.factory.createNamedImports(elements);
  }
  if (!defaultName && !namedBindings) return '';
  const next = ts.factory.updateImportDeclaration(
    statement,
    statement.modifiers,
    ts.factory.createImportClause(clause.isTypeOnly, defaultName, namedBindings),
    statement.moduleSpecifier,
    statement.attributes,
  );
  return printer.printNode(ts.EmitHint.Unspecified, next, sourceFile);
};

const serverClassifier = (title, text) => {
  const value = `${title}\n${text}`;
  const titleRules = [
    ['imports', /截图|导入|Vision|Import/i],
    ['notifications', /通知|Notification/i],
    ['ledger', /Ledger|账本|现金余额/i],
    ['risk', /风险|Risk|止损|筹码/i],
    ['market', /行情|Market|回填|标的|交易日历/i],
    ['providers', /Provider|数据源|DSA/i],
    ['performance', /收益|Performance|TTWROR|XIRR|配置|再平衡/i],
    ['backtest', /Backtest|回测|策略版本/i],
    ['journal', /Journal|复盘|交易计划/i],
    ['ai', /\bAI\b|Agent|研究|grounded/i],
    ['automation', /自动化|Automation|Workflow|定时|开盘|盘前|周报|日报/i],
    ['platform', /安全|完整性|限流|配置解析|日志|导出|错误追踪|灾备/i],
    ['portfolio', /Portfolio|账户|持仓|组合|V0\.1 核心 E2E/i],
  ];
  for (const [bucket, pattern] of titleRules) if (pattern.test(title)) return bucket;
  const refRules = [
    ['imports', /ImportService|detectScreenshotSource|validateVisionPosition|matchesSignature/],
    ['notifications', /NotificationService|buildDailyDigest|channelsForSeverity/],
    ['risk', /RiskService|evaluateV01Rule/],
    ['market', /MarketService|MarketStorageService|DataQualityService/],
    ['providers', /ProviderHealthService|ProviderConfigService|ProviderHealthScheduler/],
    ['performance', /PerformanceService/],
    ['backtest', /BacktestService/],
    ['journal', /JournalService/],
    ['ai', /AiRunService|AiProviderRegistry|runResearchAgent|runPortfolioAnalysis/],
    ['automation', /runWithRetry|dailyRiskSummary|openingScan|weeklyStrategyReview/],
    ['ledger', /LedgerService|appendLedgerEvent/],
    ['portfolio', /AccountsService|PortfolioService/],
    ['platform', /IntegrityService|ApiRateLimiter|ErrorTrackingService|parseConfig|redactSecrets/],
  ];
  for (const [bucket, pattern] of refRules) if (pattern.test(value)) return bucket;
  return null;
};

const domainClassifier = (title, text) => {
  const value = `${title}\n${text}`;
  const rules = [
    ['ledger', /证券代码标准化|Ledger|成本|现金余额|normalizeSymbol|projectAverageCost|projectFifo|projectCashBalance/i],
    ['behavior', /行为|复盘|计划|Shadow|counterfactual|detectBehavior|plannedVsActual|extractShadowStrategy/i],
    ['backtest', /Backtest|A 股执行|PIT|Universe|Walk.?Forward|Benchmark|simulateAStockExecution|runBacktest|walkForwardWindows|splitSample|parameterGrid/i],
    ['risk', /风险|止损|回撤|集中|相关|筹码|evaluateV01Rule|evaluateCompleteRule|trailingStopTriggered|concentratedExposure|pearsonCorrelation|currentDrawdown/i],
    ['performance', /收益|配置|TTWROR|XIRR|allocation|rebalanceGap|periodMetrics|tradeMetrics|quantStatsAnalytics|holdingPeriodMetrics/i],
  ];
  for (const [bucket, pattern] of rules) if (pattern.test(title)) return bucket;
  for (const [bucket, pattern] of rules) if (pattern.test(value)) return bucket;
  return null;
};

const splitTest = ({ sourcePath, outputFor, classifier, rewrite = (value) => value }) => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const describes = sourceFile.statements.filter(isDescribeStatement);
  const sharedStatements = sourceFile.statements.filter(
    (statement) => !ts.isImportDeclaration(statement) && !isDescribeStatement(statement),
  );
  const declarations = new Map();
  const sideEffects = [];
  for (const statement of sharedStatements) {
    const names = declaredNames(statement);
    if (names.length) for (const name of names) declarations.set(name, statement);
    else sideEffects.push(statement);
  }

  const groups = new Map();
  for (const statement of describes) {
    const title = describeTitle(statement);
    const bucket = classifier(title, statement.getText(sourceFile));
    if (!bucket) throw new Error(`Unclassified describe in ${sourcePath}: ${title}`);
    const group = groups.get(bucket) ?? [];
    group.push(statement);
    groups.set(bucket, group);
  }

  for (const [bucket, blocks] of groups) {
    const needed = new Set();
    for (const statement of [...sideEffects, ...blocks]) for (const ref of references(statement)) needed.add(ref);
    const included = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, statement] of declarations) {
        if (!needed.has(name) || included.has(statement)) continue;
        included.add(statement);
        for (const ref of references(statement)) if (!needed.has(ref)) { needed.add(ref); changed = true; }
      }
    }

    const importText = imports
      .map((statement) => renderImport(statement, needed, sourceFile))
      .filter(Boolean)
      .join('\n');
    const sharedText = sourceFile.statements
      .filter((statement) => included.has(statement) || sideEffects.includes(statement))
      .map((statement) => statement.getText(sourceFile))
      .join('\n\n');
    const blockText = blocks.map((statement) => statement.getText(sourceFile)).join('\n\n');
    let output = [importText, sharedText, blockText].filter(Boolean).join('\n\n') + '\n';
    output = rewrite(output);
    const target = outputFor(bucket);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output);
    console.log(`${sourcePath}: ${bucket} <- ${blocks.map(describeTitle).join(' | ')}`);
  }
  fs.rmSync(sourcePath);
};

splitTest({
  sourcePath: 'apps/server/test/services.test.ts',
  outputFor: (bucket) => `apps/server/test/${bucket}/services.test.ts`,
  classifier: serverClassifier,
  rewrite: (value) =>
    value
      .replaceAll("from '../src/", "from '../../src/")
      .replaceAll("from \"../src/", "from \"../../src/")
      .replaceAll("new URL('./fixtures/", "new URL('../fixtures/"),
});

splitTest({
  sourcePath: 'packages/domain/test/domain.test.ts',
  outputFor: (bucket) => `packages/domain/test/${bucket}.test.ts`,
  classifier: domainClassifier,
});
