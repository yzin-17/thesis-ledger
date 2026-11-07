const { createBrowserFixtures, accountIds } = require('./deferred-page-browser-fixtures.cjs');

const cases = [
  { id: 'ordinary', name: '受控实际一' },
  { id: 'long-chinese', name: '受控长期投资证券账户（人民币主账户）' },
  { id: 'long-latin', name: 'ControlledBrokerageAccountForLongTermInvestmentsUSD' },
  { id: 'unknown', name: `账户信息不可用（${accountIds[0]}）` },
  { id: 'empty', name: '受控实际一' },
];

function accountColumnFixture(schemas, sample) {
  const fallback = createBrowserFixtures(schemas);
  return (url) => {
    const value = fallback(url, 'GET');
    const endpoint = url.pathname.replace(/^\/api\/v1/u, '');
    if (endpoint === '/accounts') {
      const accounts = value
        .filter((account) => sample.id !== 'unknown' || account.id !== accountIds[0])
        .map((account) => ({
          ...account,
          name: account.id === accountIds[0] ? sample.name : account.name,
        }));
      return schemas.accountsResponseSchema.parse(accounts);
    }
    if (endpoint === '/portfolio/valuation' && sample.id === 'empty') {
      return schemas.portfolioValuationResponseSchema.parse({
        ...value,
        positions: [],
        totalCost: 0,
        totalMarketValue: 10000,
        totalPnl: 0,
        unrealizedPnl: 0,
        unrealizedPnlRatio: 0,
        realizedPnl: 0,
        realizedPnlRatio: 0,
        cumulativePnl: 0,
        cumulativePnlRatio: 0,
      });
    }
    return value;
  };
}

module.exports = { cases, accountColumnFixture };
