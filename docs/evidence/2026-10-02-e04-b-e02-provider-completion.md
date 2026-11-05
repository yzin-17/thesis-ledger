# E04-b/E02-b Provider 生产与消费配对

## 实施边界

本轮处理 Registry、配置、只读测试、移除和 OAuth 的 DSA 生产信封与 Server 消费校验。当前版本、consumer、requestId、Provider 和授权会话身份必须匹配；凭证不得回显。旧 V1/V2 请求必须在 SQLite 写入前拒绝。

已确认缺口：配置成功响应缺少当前版本信封；OAuth 成功响应无版本，取消请求无控制信封；Server Registry、配置、测试、移除仅作类型转换，OAuth 未绑定查询会话身份。

## 验证阶段

- [x] 定向验证当前正例、旧版本、错误身份、凭证不回显与撤销晚到结果。
- [x] 包级测试、构建、边界及复杂度检查。
- [x] 隔离 SQLite/HTTP 验证各 Provider 和旧信封无状态变化。
- [x] 使用官方最小更新入口同步目标运行时，验证源码匹配、只读 Registry/OAuth 及旧信封无写入。

Desktop 页面交互继续由 U01 验收；实际外部 Provider 业务数据与最终产品验收仍由 D02/U02 负责。

## 实现结果

- DSA 配置响应增加当前版本及 consumer；OAuth 创建、当前会话、按 ID 查询、取消成功响应统一携带当前信封，取消请求也在会话状态修改前校验当前版本。
- Server 新增 `integration/dsa/dsa-provider-v3.ts`，按当前结构校验 Registry、配置、测试、移除和 OAuth。配置、测试、移除绑定 requestId/providerId；移除再次核验 tombstone Provider；OAuth 查询和取消绑定 sessionId。响应顶层额外凭证字段拒绝，Registry 嵌套字段通过公开 schema 投影，不回显秘密。
- 新增 `market/market-provider-input.ts` 负责 Market 入口参数。配置、测试拒绝无效类型、未知字段、旧信封和清除/写入冲突；移除及 OAuth 取消在读取策略或调用 DSA 前拒绝旧信封。现有客户端无显式控制信封的请求继续由 Server 生成当前 DSA 信封。
- Control 传输错误分类从多层三元表达式改为独立条件函数；原错误映射由 13 项传输回归验证。没有改动凭证持久化修订、来源快照、OAuth 撤销或晚到 CAS 规则。
- DSA 既有大文件只补两项响应字段并收敛等价配置判断，文件规模不增加。新职责分别归 Market 入参边界与 DSA 传输边界；未新增跨 feature 反向依赖。

## 本地与隔离证据

| 检查 | 命令或范围 | 结果 |
| --- | --- | --- |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/integration/provider-current-contract.test.ts test/provider-oauth.test.ts test/market-control.service.test.ts test/integration/dsa.client.test.ts` | 4 文件、35 项通过 |
| DSA 既有合同与凭证生命周期 | `.venv/bin/python -m pytest`；Control V3、credentials、runtime、RQData、OAuth API/Store/Manager/runtime | 89 项通过；包括配置修订、来源快照、刷新、撤销与晚到结果负例 |
| DSA 新 HTTP/SQLite 边界 | `tests/test_thesis_ledger_provider_v3_boundary.py` 与 OAuth API | 3 项通过；Registry 实际 13 个 Provider；每个配置/测试/移除旧 V1/V2 请求拒绝；只读 fixture 测试和临时凭证测试前后 SQLite dump 完全一致 |
| Server 全包最终源码 | `pnpm --filter @thesis-ledger/server exec vitest run` | 249 文件、2029 项通过；30 文件、110 项隔离/外部环境测试跳过 |
| DSA 官方离线门禁 | `.venv` PATH 下 `./scripts/ci_gate.sh offline-tests` | 7690 项及 626 subtests 通过；1 跳过、4 deselected、69 warnings；236.30 秒 |
| API Client / Desktop | 两包现有 `test` | 46 / 523 项通过；不等于页面真实交互验收 |
| 静态检查 | Server build/typecheck、边界、修改范围 ESLint/复杂度 20/函数 220、局部 Prettier、两仓 diff check | 通过，无复杂度告警；未放宽阈值 |
| 真实跨运行时隔离 HTTP | `node scripts/e04-provider-isolated-acceptance.mjs` | 编译后的实际 DsaClient 对独立 DSA HTTP/临时 SQLite：13 个配置、13 个测试、13 个移除；凭证不回显、OAuth 当前状态通过；临时进程和数据库清理 |

隔离 HTTP 使用 fixture 能力状态，验证实际传输与合同配对，不声称外部 Provider 权限或业务数据通过。最终 Server 入口补丁前的构建曾因 `exactOptionalPropertyTypes` 不允许 Zod 可选字段直接展开而失败，已改为显式有值字段；补丁变动期间的回归也未作为最终证据，稳定源码已重新全包通过。

## 部署与目标证据

已通过官方 `../thesis-ledger-infra/scripts/sync-code.sh all` 同步 DSA 与 Server/Worker；随后发现 Server 移除/取消入参旁路，修复及稳定全包验证后使用最小 `sync-code.sh thesis-ledger` 再次同步。三项服务健康，镜像 ID 未变；两次操作均为容器可写层更新，不能作为镜像发布证据。

目标验收 `node scripts/e04-provider-target-acceptance.mjs` 通过。只读取 Registry/OAuth 当前状态并提交必定被前置拒绝的旧请求，不创建真实授权、不修改真实 Provider 凭证。

- Server/Worker 各 5 个编译模块，加 DSA 3 个实际源码模块，13 个字节匹配；使用实际 `/app/apps/server/dist/src` 入口。
- Registry 实际 13 个 Provider 经编译后 DsaClient 的当前 schema 校验；OAuth 当前状态经同一客户端校验；Server Registry HTTP 返回当前版本。
- DSA 78 个 Provider 配置/测试/移除旧信封，加 OAuth 创建/取消 4 个旧信封，共 82 个请求返回 422 和 `CONTROL_CONTRACT_UNSUPPORTED`。
- 两个旧 URL 前缀下 Registry、配置、测试、移除和 OAuth 当前状态共 10 个路径返回 404。
- Server 配置、测试、移除和 OAuth 取消的 8 个旧信封返回 400。
- SQLite 六表前后 digest 完全一致：Provider config 5 行、tombstone 0 行、OAuth session 4 行、health 31 行、policy state 1 行、policy history 29 行。PostgreSQL DesiredProviderPolicy 与 ProviderTombstone 的完整有序行记录前后完全一致；脚本只输出 SQLite 计数及摘要，不回显凭证。

## 最终对账

E04-b/E02-b 当前生产与 Server 消费合同完成。自查确认前置拒绝覆盖实际 Controller 入参，不把 TypeScript 类型视为运行时校验；当前正例来自实际 DSA HTTP 生产输出，错误身份和回显负例来自 Server 定向回归；凭证来源、修订及晚到 CAS 复用现有实现和定向证据。

E02/E04 父项继续保持未完成。下一项为 E04-c/E02-c Policy、Catalog、缓存与派生配对。Desktop 真实交互、真实外部 Provider 业务、最终镜像及部署产品验收继续由 U01/U02、D01/D02/D03 负责，未作完成声明。未提交或推送，三仓既有未提交工作保留。
