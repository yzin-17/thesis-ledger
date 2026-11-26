/** 仅装配当前读取器与单比赛服务；不启动应用生命周期、调度器或队列。 */
export async function createScopedLiveReaders(db, redis, historical) {
  const load = name => import('./dist/src/' + name + '.js');
  const modules = await Promise.all([
    'integration/dsa/dsa.client', 'market/market.service', 'market/market-period-calendar-reader',
    'market/market-lifecycle-reader-v3', 'market/market-action-coverage', 'market/market-live-execution-reader',
    'market/market-arena-valuation-reader', 'market/market-control.service', 'market/market-chart-reader-v3',
    'market/market-chart-proof.repository', 'market/market-chart-result-cache', 'market/market-session-reader',
    'market/market-window-evidence-v3.repository', 'market/market-bar-reader-v3', 'market/market-bar-reader',
    'market/market-minute-display.service', 'market/market-period-indicator-reader', 'market/market-native-indicator-reader',
    'market/market-research-series-reader', 'market/market-news-reader', 'ai/research-public-search',
    'market/instrument.service', 'model-arena/live/live-research-tools',
  ].map(load));
  const [{ DsaClient }, { MarketService }, { MarketPeriodCalendarReader }, { MarketLifecycleReaderV3 },
    { MarketActionCoverage }, { MarketLiveExecutionReader }, { MarketArenaValuationReader }, { MarketControlService },
    { MarketChartReaderV3 }, { MarketChartProofRepository }, { MarketChartResultCache }, { MarketSessionReader },
    { MarketWindowEvidenceV3Repository }, { MarketBarWindowReaderV3 }, { MarketBarReader }, { MarketMinuteDisplayService },
    { MarketPeriodIndicatorReader }, { MarketNativeIndicatorReader }, { MarketResearchSeriesReader }, { MarketNewsReader },
    { ResearchPublicSearch }, { InstrumentService }, { LiveResearchTools }] = modules;
  const dsa = new DsaClient(), calendars = new MarketPeriodCalendarReader(dsa);
  const sessions = new MarketSessionReader(calendars), market = new MarketService(dsa, redis, db, undefined, sessions);
  const actions = new MarketActionCoverage(dsa), control = new MarketControlService(db, dsa);
  const reader = new MarketLiveExecutionReader(market, calendars, new MarketLifecycleReaderV3(dsa), actions, dsa);
  const valuation = new MarketArenaValuationReader(market, actions);
  const chart = new MarketChartReaderV3(control, dsa, new MarketChartProofRepository(), undefined,
    new MarketChartResultCache(dsa, redis, sessions));
  const bars = new MarketBarReader(new MarketBarWindowReaderV3(control, dsa,
    new MarketWindowEvidenceV3Repository(db)), chart);
  const minutes = new MarketMinuteDisplayService(calendars, bars, new MarketPeriodIndicatorReader(dsa, redis));
  const series = new MarketResearchSeriesReader(bars, chart, minutes, new MarketNativeIndicatorReader(dsa, redis));
  const liveTools = new LiveResearchTools(new InstrumentService(db), market, series,
    new MarketNewsReader(dsa), new ResearchPublicSearch(dsa), historical.replay, reader);
  const tools = { execute: (...args) => args[3] ? historical.tools.execute(...args) : liveTools.execute(...args) };
  return { market, reader, valuation, tools };
}
