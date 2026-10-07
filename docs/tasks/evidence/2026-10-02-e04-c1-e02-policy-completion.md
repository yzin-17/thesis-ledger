# E04-c1/E02-c1 Policy 当前投影与尝试 CAS

## 执行边界

按主 Spec 不变量 8 完成 Policy 当前生产/消费与 Server 提交身份边界。现有 DSA V3 Policy 事务、单调修订与目标匹配保留；本轮不实施 Catalog Snapshot/Delta/ACK/Job 或 Market 缓存派生。

已确认缺口：Server 回写仅按 revision，无法区分同 revision 并发 Apply；历史投影无条件更新。公开 Policy 读取仅检查 Effective 的 sourceDesiredRevision，旧版本或结构不完整的投影可能被标记为当前。Apply 入口对目录仅检查 integrity，缺少完整 schema 边界。

目标复核还确认 DSA 当前准入过期会输出 `admission_expired`，共享 Schema 未登记此原因，导致整个 Effective 响应被拒绝。DSA 实际准入状态函数同时输出 `admission_invalid` 与 `admission_not_yet_valid`。本叶配对补齐三个当前拒绝原因及中文标签，不续期或改动目标真实准入，不放宽 eligible 判断。Catalog 完整性状态不随这三个细化原因扩张；目录仍只反映当前既有状态集合。

## 实施与验收

- [x] 在现行存储路由容器中登记 Apply requestId 与独立 attemptId，提交时原子核验 consumer/revision/尝试；旧结果不修改当前及历史。
- [x] 当前 Effective 与目录严格校验；不同 revision 的当前投影可显式陈旧，旧格式投影不能补版本回读。
- [x] 定向验证晚到失败、晚到成功、跨 revision、无效目录/投影与正例。
- [x] 包级测试、构建、类型及边界检查。
- [x] 隔离 PostgreSQL/SQLite 验证实际 CAS、回滚与无污染；目标只读当前 Policy/目录、同内容幂等 Apply 和旧请求拒绝。

## 保留边界

Catalog 合同与恢复归 c2，缓存/派生归 c3，Desktop 真实交互归 U01。不修改目标真实策略来制造正例；目标运行时通过官方最小更新入口同步。三仓未提交写集保留，不提交或推送。

## 实现结果

`market-policy-attempt.ts` 在现行 JSON 路由容器登记 `{ requestId, attemptId }`，attemptId 为每次执行独立生成的 UUID。领取以 consumer/revision 更新当前行，并在同一 PostgreSQL 事务中标记历史行 pending。网络操作在事务之外执行；结果提交时同时核对 consumer/revision/requestId/attemptId，匹配一行后才更新历史。被后续尝试或新 revision 替代的结果返回数据库最新当前行，不提交旧状态；未领取的旧 revision 不调用 DSA。

`market-policy-catalog.ts` 在 Apply 前完整解析当前精确目录、在回写前完整解析当前 Apply 响应，继续核对 Desired 内容、Effective 来源修订、目标顺序与精确来源。`market-policy-storage.ts` 在公开读取时完整解析非空 Effective，旧版本和不完整结构抛出 409；同修订但 enabled/RouteKey/target 不匹配的当前格式投影标为陈旧。不同 Desired revision 的完整当前投影保留为明确陈旧记录，不能作为当前生效事实。

共享 `market-route-v3.ts` 补齐 DSA 已产出的三个细化准入拒绝原因。`MarketChartAdjustment.tsx` 与 `market-data-routes-v3.ts` 仅补中文标签；eligible 与 reason 的互斥校验保持。按 shadcn skill 核对 Desktop `components.json`、锁定 CLI `pnpm exec shadcn info --json`/`docs select`、现有 Base UI Select 和[官方 Select 文档](https://ui.shadcn.com/docs/components/base/select)，没有组件安装、依赖或 DOM/交互改动。

本轮无 Prisma Schema/migration、运行时 manifest、DSA 生产代码或基础镜像输入变更。内部尝试标记沿用既有 `storageVersion: 3` 路由容器元数据；客户端仍消费标准 Desired routes，未新增跨 feature 依赖。

## 本地与隔离验证

| 检查 | 命令与输入 | 结果 |
| --- | --- | --- |
| Server Policy 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/market-policy-catalog.test.ts test/market-control.service.test.ts test/market/market-policy-storage.test.ts test/market/market-route-revision.test.ts test/market/market-route-catalog-read.test.ts` | 5 文件、36 项通过；包含 4 种同 revision/requestId 晚到正反例及旧目录/Apply/投影拒绝 |
| 当前准入原因 Schema | `packages/schemas/test/market-route-v3.test.ts` | 7 项通过；三个拒绝原因可解析且不得配合 eligible=true |
| DSA 实际 Policy/准入状态 | `.venv/bin/python -m pytest tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_current_data_route.py tests/test_thesis_ledger_admission_v3.py -q` | 31 项通过；SQLite 两连接同修订冲突、单调/idempotent、旧行拒绝和真实状态转换 |
| Server 全包最终源码/Schema | `pnpm --filter @thesis-ledger/server exec vitest run` | 249 文件、2034 项通过；31 文件、116 项隔离/外部环境测试跳过 |
| Schemas 全包 | `pnpm --filter @thesis-ledger/schemas test` | 50 文件、586 项通过 |
| Desktop/API Client | 各包 `test` | 523 / 46 项通过 |
| 构建与类型 | Schemas/Server build、Server typecheck、Desktop typecheck/build | 通过；Desktop 保留既有 Vite 大 chunk 提示，未放宽阈值 |
| 静态门禁 | 修改范围 ESLint、复杂度 20/函数 220、仓库边界、局部格式、diff check | 通过；未新增阈值/ignore |
| 隔离 PostgreSQL 实际 CAS | `E04_POLICY_POSTGRES=1 pnpm --filter @thesis-ledger/server exec vitest run test/market/market-policy-postgres.integration.test.ts` | 6 项通过；实际 app role、完整 migration/head/权限；4 种同 revision/requestId 晚到结果、跨 revision/未领取旧请求、旧 Effective 不回读、历史缺失时事务回滚。当前与历史完整行前后相等，临时容器清理 |

DSA 生产输入未变化，其官方离线 7690 项/626 subtests 证据复用 [Provider 配对阶段](2026-10-02-e04-b-e02-provider-completion.md)，本轮没有重复运行该高成本门禁。初次目标检查因未登记 `admission_expired` 被严格解析器拒绝，此拒绝是已修复的合同缺口，不作为通过证据。共享 Schema 更新期间一次 Server 全包的未修改冻结比较测试达到 5 秒超时；独立 4 项通过，构建结束后全包 2034 项重新通过，未调高超时或跳过测试。

## 目标检查

使用官方 `../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger` 两次：首次同步 Policy CAS，发现目标准入原因合同缺口后，完成共享 Schema/标签与全包验证再同步最终编译输入。Server/Worker 健康，镜像仍为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`。这是容器可写层更新，不是镜像发布；没有 Prisma/SQLite 结构、真实策略或准入升级操作。

目标验收 `node scripts/e04-policy-target-acceptance.mjs` 通过：

- Server/Worker 各 6 个实际编译模块与 shared Schema，共 12 个，加 DSA Policy 2 个源码模块，14 个字节匹配；Schema 核对实际 pnpm package 路径，Server 使用实际 `/app/apps/server/dist/src` 入口。
- 实际 DsaClient 的 Effective/精确路由目录读取解析通过；当前 Policy revision 32、目录 revision 4380298194303938。仅对已存在同修订同内容 Policy 进行 DSA Apply，返回 `idempotent: true`；该路径由源码确认不更新策略行，状态见证也完全不变。
- DSA Policy 旧版本 POST 及 Effective/目录旧版本 Query，共 6 次前置拒绝；两个旧前缀下 Apply/Effective/目录 6 个路径返回 404；Server 两个旧版本和两个旧字段/矩阵请求返回 400。
- 目标 Server Policy HTTP 返回当前非陈旧投影；PostgreSQL 当前行及全部历史完整有序记录前后完全相同。
- SQLite policy state 1 行、policy history 29 行、route admission 4 行、provider config 5 行、provider health 31 行，计数与摘要前后完全一致。没有刷新准入或调用真实数据来源；已过期 NAV 准入继续作为不可用目标被解析，不能据此创建新 NAV 业务 Run。

## 最终对账

E04-c1/E02-c1 完成，Policy 的当前存储/生产/消费、精确目标和多尝试提交断言都有对应正反例与目标证据。Catalog Snapshot/Delta/ACK/Job 的当前信封和恢复仍归 c2；缓存、派生和实际多消费者仍归 c3。E04-c/E02-c/E02/E04 父项保持未完成。

下一项为 E04-c2/E02-c2 Catalog 同源合同与恢复。Desktop 本轮只有类型配对及中文标签，真实页面/Electron 验收继续归 U01；全功能、镜像和部署验收继续归 U02/D01/D02/D03。未提交、推送或清理其他未提交工作。
