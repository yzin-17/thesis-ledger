// 受控浏览器响应投影；数据库搜索和权限另由隔离 PostgreSQL 验证。
function arenaCatalogFixture(s, live, history, input) {
  const query = s.arenaCatalogQuerySchema.parse(Object.fromEntries(input));
  const project = (row, kind) => ({ id: row.id, kind, title: row.protocol.title, market: row.protocol.market,
    state: row.state, startsOn: row.protocol.startsOn, endsOn: row.protocol.endsOn, createdAt: row.createdAt,
    models: row.protocol.entrants.map(({ providerId, model }) => ({ providerId, model })) });
  const all = [...live.map((row) => project(row, 'live')), ...history.map((row) => project(row, 'history'))];
  const search = query.search.toLowerCase();
  const rows = all.filter((row) => (query.kind === 'all' || row.kind === query.kind) &&
    (query.market === 'all' || row.market === query.market) && (query.state === 'all' || row.state === query.state) &&
    [row.title, ...row.models.flatMap((model) => [model.providerId, model.model])].some((value) => value.toLowerCase().includes(search)));
  rows.sort((a, b) => {
    if (query.sort === 'title') return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    if (query.sort === 'created_asc') return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
    if (query.sort === 'season_desc') return b.startsOn.localeCompare(a.startsOn) || a.id.localeCompare(b.id);
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
  });
  const page = Math.min(query.page, Math.max(1, Math.ceil(rows.length / query.pageSize)));
  return s.arenaCatalogResultSchema.parse({ items: rows.slice((page - 1) * query.pageSize, page * query.pageSize),
    total: rows.length, totalUnfiltered: all.length, page, pageSize: query.pageSize });
}
module.exports = { arenaCatalogFixture };
