# 新闻消费合同与读模型证据

对应[研究增强 Task](../2026-10-18-research-evidence-evolution.md)的 T1/T2；生产侧事实见 [DSA N1 证据](../../../../daily-stock-analysis/docs/tasks/evidence/2026-10-18-data-only-service-news-contract.md)。核对日期：2026-10-19。

## T1：同版合同与客户端

- 固定 `NEWS_SEARCH`、`news-search-v1`，请求和响应均严格拒绝未知字段/版本；请求不接受账户、持仓或模型材料。保留来源、路由修订、原 URL、原始时间、当前检索覆盖与全部错误。
- 两仓分别保存同一批 12 组受控样例，均为 28,834 字节，SHA-256 为 `388f19f1275965042020a340f6c6659c47c973164df67315577cd01126404a05`。主仓副本位于 `packages/schemas/fixtures/news-search-v1.samples.json`，独立检出主仓也能运行回归；DSA 文件仍为生产合同样例事实源。
- Schema 验证有效日期、显式时区及微秒闭区间，保留未知发布时间和来源可见时间；转载保留独立条目并共享证据组。Dsa 适配层用 SHA-256 核对来源条目与原始出处/内容指纹身份。
- `DsaClient.marketNewsV3` 使用既有 Data Token POST，一次请求，期限取请求预算与现有 DSA 超时的较小值。HTTP 来源失败保留经关联校验的完整响应；网络错误、无效 JSON、鉴权和不支持的端点分别处理，不返回伪造成功空结果或回退分析接口。
- 为保持原客户端规模，按传输职责将原有错误类型、错误转换和 Control 错误分类提取至 `dsa-client-errors.ts`；保留 `DsaError` 原导出兼容。没有更改来源选择、默认路由、SDK、凭据或配置。

验证：

| 命令与输入 | 结果 | 证据层级 |
| --- | --- | --- |
| `pnpm --filter @thesis-ledger/schemas exec vitest run test/market-news-v3.test.ts` | 38 项通过 | 同版样例、反例、时间与关联的本地合同 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/integration/dsa-news-v3.test.ts` | 最终 31 项通过 | 真实 reader/客户端及受控 fetch，不是实际来源调用 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/integration/dsa*.test.ts`（按文件枚举 21 个实际测试文件） | 21 文件、208 项通过 | 提取错误处理后的行情、NAV、事件、目录、状态及新闻回归 |
| `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/server typecheck` | 通过 | 共享包与 Server 静态检查 |

## T2：Market 事实读模型与受控 HTTP

- 新增 `market-news-contract.ts`、`market-news-reader.ts` 和 `market-news.controller.ts`；在 `MarketModule` 注册并导出 Reader。上层消费标准事实，不接受 SDK 选项、Provider 选择、账户、持仓或 Prompt。
- `POST /api/market-data/news` 的输入由共享新闻字段构造，并重新验证完整的窗口与身份；原服务预算与调用者预算取较小值。响应保留条目、出处、实际路由修订、覆盖、错误及原始时间，空结果与不可用保持区别。
- 合法错误合同优先于裸 HTTP 状态：`404/not_covered`、`403/missing_credentials` 保留原始来源分类。没有合法合同的鉴权、能力缺失、协议失败、网络失败和超时分别明确不可用；抓取时点及上游尝试数为未知，不写成成功空检索或零尝试。
- 当前新闻合同没有读取前路由代次/统一新鲜度保证，所有响应使用 `Cache-Control: no-store`，没有 Redis/持久缓存复用。可用结果身份包含市场、资产类型、证券、窗口、条数、游标、预算、合同和实际来源/策略/路由/凭据修订；无合格来源时身份为空。
- `scripts/check-boundaries.mjs` 固化研究经 Market 取数、Market/AI 不反向依赖研究及其他业务不得绕过 `MarketNewsReader` 调用新闻 DSA 入口的方向。

`pnpm --filter @thesis-ledger/server exec vitest run test/market/market-news-http.test.ts test/integration/dsa-news-v3.test.ts`：最终两文件 61 项通过，其中 HTTP 30 项。HTTP 两端均为本机随机端口，一端是真实 Nest Controller/Reader，另一端按 N1 同版样例响应；使用原 DsaClient 的真实 fetch/认证/超时/协议解析，不 mock 新闻结果转换。覆盖全部合法样例、私有材料/跨市场/时间/预算非法输入、缓存身份修订、超时、断连、无效 JSON 和来源错误。没有启动实际 DSA 或访问外部来源。

共享 Schema 全量 101 文件 1,129 项通过；Server 受影响 40 文件 433 项通过，其后新闻错误优先级补充 61 项通过。Server/Desktop 正常类型检查和构建、边界/workspace 依赖/尺寸检查通过；本轮新模块定向 lint 无错误，全仓仍保留既有 `portfolio.account-actions.ts` 三处 `no-floating-promises` 错误及旧复杂度警告。目标部署、浏览器与真实来源未验收。

## 运行边界

本文件的样例均为受控合同资料，不证明实源可用、准入、历史覆盖或严格 PIT。没有请求实际 DSA、搜索供应商或模型，没有开启来源、修改通知或用户交易。DSA N2/N3/DG3 和研究 G1/G3 分别保留原前置。
