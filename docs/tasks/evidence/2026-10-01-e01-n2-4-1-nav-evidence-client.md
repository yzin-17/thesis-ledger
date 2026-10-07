# E01-N2.4.1 精确净值证据客户端验收

## 边界与交付

2026-10-01，将 N2.4 按可独立验收的消费边界拆成：N2.4.1 DSA 证据客户端、N2.4.2 Market 路由 Reader、N2.4.3 NAV 配置准备。本轮只实施 N2.4.1，父项保持未完成。

新增 `DsaNavClient`，由 DsaModule 注册并导出。使用已有配置及 Data Token，单次调用精确 `/api/v3/thesis-ledger/backtest/nav-inputs`，固定请求 ID 和身份，禁止跟随重定向；整个 HTTP 响应按流读取，上限 128 MiB，内层来源信封上限 64 MiB，使用现有 `DSA_TIMEOUT_MS` 和单调时间预算，解析后超时也拒绝。既有 DsaClient 未扩展。

原文核验按稳定职责分成：

- `dsa-nav-raw.ts`：规范摘要、精确时间比较、有深度限制和重复键拒绝的数据词法解析。东方财富身份原文只允许受限裸键数据，不执行来源 JavaScript。
- `dsa-nav-envelope.ts`、`dsa-nav-source-pages.ts`：信封身份、完整页序/状态/长度/总量/摘要、日期唯一性与正净值；消费的原生片段必须实际存在于指定页，规范记录和稳定 ID 绑定原生摘要。
- `dsa-nav-rule-proof.ts`：基金代码和来源类型关联、规则记录原文、普通用户决定及 QDII 官方 PDF 字节核验；对 QDII 另按已核查基金/版本/文件摘要/规则适用区间登记核对。
- `dsa-nav-calendar-proof.ts`：关联来源/规则/决策/假设及 XSHG 制品身份；估值日期重新取原文范围，处理日期重新取披露工作日交集，并独立计数披露工作日和可见时间。
- `dsa-nav-v3.ts`：固定请求/响应身份、逐条事实与规范/原生记录关联、全部采集时刻及稳定协议错误映射。

跨模块门禁新增：DSA 适配边界不能反向依赖 Backtest；Backtest NAV 准备应消费 Market Reader，不能直接引入 DsaNavClient。没有新增无所有权的共享杂物层。

## 定向与相邻回归

| 检查 | 命令/输入范围 | 结果 |
| --- | --- | --- |
| 新增定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/integration/dsa-nav-v3.test.ts` | 28 项通过 |
| 相邻回归 | 新增文件、`dsa-events-v3.test.ts`、`dsa.client.test.ts`、`backtest-nav-snapshot-store.test.ts`、`backtest-nav-visibility.test.ts`，`--maxWorkers=2` | 最终 5 文件 92 项通过 |
| 模块注册 | 实际 `NestFactory.createApplicationContext(DsaModule)`，读取导出的 DsaNavClient 并关闭上下文 | 通过，不连接业务数据库或外部服务 |
| 类型/构建 | Server typecheck、build | 通过，未改变 Schema/依赖/数据库输入 |
| 代码门禁 | 修改文件 ESLint、复杂度上限 20、函数尺寸上限 220、Prettier；`node scripts/check-boundaries.mjs` | 通过 |

定向测试包含：完整原文和十进制保留；请求 ID、修订、目标、决策及冻结时点错配；外层重新计算摘要后仍拒绝页状态/摘要/批次/原生记录/类型/文档/假设/日历/未来时刻/记录缺失；未知来源类型、修改文档和文档自身摘要；重复及转义重复键、执行语法、深度预算；鉴权、精确请求、禁止重定向、不重试；稳定错误及错误请求关联；流量预算、非法 UTF-8 和单调时间超时。

首轮 24 项后补充深层篡改、超时与模块注册用例。首轮复杂度和夹具函数尺寸超限，按规则证明、来源页、原生记录/事实职责提取校验或夹具函数，复验通过，未提高阈值。模块验证最初引用未安装的 `@nestjs/testing` 失败，改用项目已有 NestFactory，未新增或安装依赖。

## 真实原文消费与冻结接缝

复用 N2.3 已实际采集的三份完整不可变来源信封，临时缓存 `/private/tmp/e01-nav-live-packets.json`；此次未重新拉取上游。隔离本地 HTTP 服务返回捕获原文，实际 DsaNavClient 发起鉴权 POST、读取字节并执行全部原文核验，再交给现行 Server 的 LocalNavSnapshotStore 写入 Parquet 并离线重放。HTTP 服务检查路径、方法、token、请求 ID 和完整请求体，三只基金各一次请求。

| 标的 | 原来源条数 | 延迟 | 净值事实数 | 原净值采集 UTC 时刻 | 客户端核验及冻结耗时 |
| --- | --- | --- | --- | --- | --- |
| 161725.OF | 2764 | T+1 | 10 | 2026-09-30T17:30:22.018521+00:00 | 619 ms |
| 110011.OF | 4410 | T+1 | 10 | 2026-09-30T17:30:36.107170+00:00 | 712 ms |
| 118001.OF | 3900 | T+2 | 10 | 2026-09-30T17:30:49.634621+00:00 | 596 ms |

三组原始整批摘要分别为：

- 161725：`73ea7de7585648761967086c046fe6a42abf6d8d6895beaed49df0a9aac674d8`
- 110011：`099c4c313a68958c547dfb298aa90bbc8376bbba449cdc9844a617a57b28f5a3`
- 118001：`1e77d74c3e89dcfc50e1277ef7dceb7eaab559aef3c264c0ecf0418c2d2f2913`

三只全部完成：鉴权 HTTP、完整原文/规则/假设/日期核验、真实 Parquet 冻结、manifest 与完整上下文离线一致性。探针为 `/private/tmp/e01-n2-4-1-nav-client-probe.mjs`，命令 `node /private/tmp/e01-n2-4-1-nav-client-probe.mjs` 成功；临时冻结目录验收后清理。

这证明当前客户端能消费实际来源证据，不能作为新一轮上游读取、当前路由状态、目标部署或业务 Run 的验收。原始来源采集的独立证据见 [N2.3 生产验收](2026-10-01-e01-n2-3-2-3-nav-exact-production.md)。

## 后续执行顺序与预算

下一叶 N2.4.2 建立 Market 精确 Reader，核对 Server Desired 与 DSA Effective/Catalog，在读取前后重新核验当前状态和目标，拒绝撤销/修订变化。之后 N2.4.3 绑定策略与完整 N1 输入计划、采集后冻结时点和 NAV 准备结果；N2.5/6 继续业务持久化和隔离数据库验收。

客户端遵循现有 `DSA_TIMEOUT_MS`，默认 5 秒；本次隔离 HTTP 耗时不能证明该默认预算足以完成实时来源下载。N2.4.2 的实际 API 接线和 N4 部署验收须核对完整来源读取与客户端总预算；此次没有更改目标配置、Policy/Admission、数据库、Worker 或公开准备 API。
