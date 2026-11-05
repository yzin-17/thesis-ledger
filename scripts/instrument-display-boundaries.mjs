const readers = new Map([
  ['portfolio/portfolio.service.ts', 'nameAssets'],
  ['ledger/trade-query.service.ts', 'nameAssets'],
  ['risk/risk-rule.service.ts', 'resolve'],
  ['risk/risk-context.service.ts', 'resolve'],
  ['ai/ai-research-query.ts', 'resolve'],
  ['fund-plans/recurring-fund-investment.service.ts', 'resolve'],
]);

export function instrumentDisplayBoundaryViolation(file, source) {
  const relative = file.replace(/^apps\/server\/src\//u, '');
  if (file.startsWith('apps/server/src/') && readers.has(relative)) {
    const method = readers.get(relative);
    if (!source.includes('InstrumentDisplayService') || !source.includes(`this.display.${method}(`))
      return '当前标的名称读取必须消费 Market 公共名称服务';
    if (/\basset\.findMany\s*\(/u.test(source))
      return '当前标的名称不得从 Asset 批量反查，须解析 Instrument 目录';
    if (/fundName:\s*(?:asset\.name|plan\.fundName)/u.test(source))
      return '当前计划和新冻结实例的名称须在生成边界解析目录';
    if (/context\.assetName\s*\|\|/u.test(source)) return '传入的旧名称不得遮蔽当前目录名称';
  }
  if (file.startsWith('apps/server/src/market/instruments/instrument-display')) {
    if (
      /from\s+['"](?:\.\.\/)+(?:portfolio|ledger|risk|ai|fund-plans|notifications)\//u.test(source)
    )
      return 'Market 名称服务不得反向依赖消费方业务模块';
  }
  return null;
}
