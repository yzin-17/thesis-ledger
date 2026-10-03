# E01-N2.4.2 精确净值 Reader 验收

日期：2026-10-01。所属任务：E01-N2.4.2。

## 实现范围

- `apps/server/src/market/market-nav-route-v3.ts`：核对 Desired、Effective、Catalog；固定路由主备顺序与首个合格且就绪目标。
- `apps/server/src/market/market-nav-reader-v3.ts`：先后捕获路由状态，调用独立 DsaNavClient 一次，返回请求、完整响应及路由状态；检查响应身份、准入范围、来源修订及当前有效期。
- `apps/server/src/market/market.module.ts`：注册并导出 Reader。
- `apps/server/test/market-nav-reader-v3.test.ts`：受控负例与调用次数验收。

原文一致性核验继续由 N2.4.1 客户端负责。本叶不引入准备凭据、冻结写入、数据库变更或 Run 投递。

## 本地验证

输入范围为上述 Reader、路由函数、模块接线、定向测试与已就绪的 DSA NAV 客户端。

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/market-nav-reader-v3.test.ts test/integration/dsa-nav-v3.test.ts` | 2 文件，51 项通过；其中 Reader 23 项 |
| `pnpm --filter @thesis-ledger/server typecheck` | 通过 |
| `pnpm --filter @thesis-ledger/server build` | 通过 |
| 限定 ESLint 与 Prettier 检查 | 通过 |
| Reader 与路由函数复杂度 20、函数尺寸 220 门禁 | 通过 |
| `node scripts/check-boundaries.mjs` | 通过 |
| 构建后 MarketModule 元数据 provider/export 检查 | 通过；未启动完整业务模块 |

受控测试覆盖未应用、陈旧、禁用、路由缺失、Desired/Effective 修订及目标序列错配、目录不完整、未准入；读取中目录修订改变、撤销、Desired 改变、资格变化；响应请求/来源错配、基金及日期准入错配、有效期过期或未来、适配器修订错配。主源无资格时可固定已就绪第二目标；首个就绪来源无适配器时拒绝；来源失败后不重读或换源。目录生成时间变化不构成状态变化。测试时间固定，避免准入样本随实际日期失效。

## 隔离实时 HTTP 与上游

验收时间约为 2026-10-01 02:47（Asia/Shanghai）。使用临时 SQLite 准入与策略，实际 DSA Control router、NAV router 和生产来源 Reader，经本机鉴权 HTTP 调用。Server Desired 使用隔离控制桩，DsaClient 与 DsaNavClient 为当前构建的真实客户端，MarketNavReaderV3 为当前构建；每次实际抓取上游基金身份、净值原文以及所需规则文件，没有复用旧来源缓存。

| 基金 | 披露研究规则 | 完整事实数 | Reader 总耗时 |
| --- | --- | --- | --- |
| `161725.OF` | 用户明确普通 T+1 | 10 | 15982 ms |
| `110011.OF` | 已审核 QDII T+1 | 10 | 15845 ms |
| `118001.OF` | 已审核 QDII T+2 | 10 | 14313 ms |

三个读取均返回完整原文证据并通过客户端核验，读取前后 Desired/Effective/Catalog 一致，精确目标为 `efinance/eastmoney`、`routeIndex=0`，Desired/Effective 修订均为 1，Catalog 修订为 `3439664293651383`。共三次来源调用，无失败后的再次调用。每份包含四个预热期和四个结算尾部交易日；本叶未绑定完整策略输入计划。

隔离配置 `dsaTimeoutMs=120000`。真实读取耗时超过现有默认 `DSA_TIMEOUT_MS=5000`，默认预算不能作为目标就绪证据；N4 须设置合适的目标预算并验证。本叶未修改目标配置。

临时验收入口：`/private/tmp/e01-n2-4-2-nav-api.py`、`/private/tmp/e01-n2-4-2-nav-reader-probe.mjs`。进程结束后关闭 HTTP 服务并删除隔离 SQLite；没有写目标 Policy 或 Admission。

## 证据边界与下一步

现行 Catalog 只提供就绪状态，没有准入记录版本。DSA 生产入口负责准入范围与读取前后核验，Market 负责当前路由目录状态及返回准入有效性；本叶不宣称新增独立准入查询能力。上述实时正例不替代目标 Server 数据库、完整模块启动、部署或业务 Run 验收。

N2.4.2 完成，N2.4 父项保持未完成。下一叶 N2.4.3：显式规则及日期预算绑定完整 N1 输入计划与策略/配置摘要，采集后确定冻结时点，返回 NAV 专属准备结果。
