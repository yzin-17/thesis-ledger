# 每手股数独立路由与富途接入任务

任务标识：LOT。关联：[Spec](../../specs/2026-10-08-security-lot-size-routing.md)。状态：当前所选富途来源的代码、开发同步、真实股数查询、冻结执行、重放、实际页面及下载全部验收通过；最终一致性复核通过，Task归档，现行Spec保留。长桥未配置、未实读；镜像未重建，开发同步边界保留，见[真实验收](../../tasks/evidence/2026-10-08-security-lot-size-live-acceptance.md)。

## 实施叶与结果

- [x] LOT-1：DSA 只读适配器。富途静态资料读取与长桥每手字段适配完成；标的、股数、缓存观察时刻、连接关闭及超时有定向测试。
- [x] LOT-2：DSA Provider 与独立能力。富途登记 `opend` 主机／端口配置；两家均提供香港股票 `SECURITY_LOT_SIZE` 路由，复用现有主备、凭证和 Data Token。未配置时显示不可用，不自动指定优先级。
- [x] LOT-3：Server 产品查询契约。新增 `GET /api/market-data/security-lot-size`，独立于价格路由；严格匹配请求标的、实际来源、股数及返回时间，保留未配置路由的实际提示。
- [x] LOT-4：Desktop 配置与参数消费。增加路由中文标签、OpenD 连接说明和“按路由查询当前每手股数”。查询只进入草稿，需应用／重新确认；失败保留原值，卸载取消请求，手动覆盖继续可用。独立参考按标的冻结，不要求等于价格包内旧静态默认；旧预设及价格资格限制保持。
- [x] LOT-5：统一验证。DSA 109、Schema 15、Server 16、Desktop 26 项定向／相邻测试通过；受影响构建、定向 ESLint、模块边界和两仓 `git diff --check` 通过。不宣称仓库全量测试或真实券商验收。
- [x] LOT-6a：目标代码同步与 HTTP。正式 `sync-code.sh all` 退出 0；修复错误合同后，最小 `sync-code.sh thesis-ledger` 再次退出 0。目标服务健康，实际 Provider 和路由目录可见两家每手能力。
- [x] LOT-6b：真实券商读取。用户启动OpenD并提供11111；通过产品接口配置/启用富途、增加独立每手主源，00147真实返回5000、00700返回100。默认5000与覆盖1000的两条标准回测成功，来源/时钟/标的冻结、独立金额、各两次网络0重放、Safari及全文下载核对通过；31条旧任务保持，其他路线恢复。长桥未选用，不记实读，见[真实验收](../../tasks/evidence/2026-10-08-security-lot-size-live-acceptance.md)。
- [x] LOT-6c：实际页面与旧冻结兼容。Desktop消费面；真实Safari读取独立路由和富途主机/端口表单，查询503失败保留5000，确认/准备失效，手动覆盖1000并应用、重新确认后可准备。关闭草稿后旧任务不变；当前Worker对24条既有成功任务各两次网络0重放通过。该叶不代替LOT-6b的真实来源成功返回。

## 最初开发同步检查点

2026-10-08 核对 `GET /api/market-data/providers`：富途仅声明 `SECURITY_LOT_SIZE: STOCK`，连接字段 `host`／`port`；长桥原有行情和日线能力保留，增加同一每手能力。两家均为 `configured=false`、`enabled=false`、`credentialConfigured=false`。

路由目录 HTTP 200、`complete`，香港股票每手能力分别列出 `futu/futu` 与 `longbridge/longbridge`，状态均为 `credential_missing`。未配置路由时，实际产品查询返回 HTTP 503 和“当前 Control 未配置对应能力路由”；美股代码返回 HTTP 400，不调用券商源。

同步前后回测摘要列表均为 31 条：24 成功、7 失败，无排队／运行项。该检查是摘要状态核对，不冒充完整行摘要或全量重放。Server 健康接口及其数据库、Redis、DSA 依赖为 healthy。

本次只更新容器可写层，没有重建镜像或改变数据库／卷；容器重建后会恢复镜像内代码，源码仍保留。Server／Worker 保持 `9345cf6cd27f…` 镜像。Desktop 完成构建与组件交互测试，未另做实际浏览器页面验收。

上述“未另做浏览器验收”为最初同步检查点；随后LOT-6c已完成，以下继续验收记录为当前消费与兼容结论。镜像固化边界保持不变。

## 配置前继续验收检查点（2026-10-08）

当前产品HTTP再次确认富途/长桥均未配置、未启用；精确路由目录HTTP200，`HK/STOCK/SECURITY_LOT_SIZE`列出`futu/futu`和`longbridge/longbridge`，状态均`credential_missing`。每手查询00147返回503及“当前Control未配置对应能力路由”，GME.US返回400；Server及其依赖healthy。本机仅检查已说明的默认OpenD端口11111，没有监听；未据此推断其他主机/端口也不可用。

当前源码使用`pnpm --filter @thesis-ledger/desktop exec vite --host 127.0.0.1 --port 5184 --strictPort --force`启动独立页面，避免5183此前Schema预打包缓存。Safari实际路由页显示“香港股票·每手股数”，候选为富途和长桥，未配置候选明确显示凭据缺失；未保存或改变原价格路由。富途配置表单实际显示OpenD主机地址、端口及`host.docker.internal`说明，未填写或保存连接信息。

实际任务`e629fe80-56b6-4455-a82f-2ba5f73ddc2d`再次运行草稿：先确认原模型，点击按路由查询后失败提示可手动覆盖，原5000保留，确认和准备禁用。手动输入1000、应用后显示采用1000/来源默认5000/手动覆盖，重新确认后准备入口恢复；随后关闭未提交草稿，旧冻结结果保留，没有创建新任务。该流程只证明未配置来源的错误与手动消费路径，不冒充实际券商股数。

与HK5版本绑定备份的七张业务表保护状态完全一致，当前无活动回测、仍有24条成功V3；当前可写层Worker对全部24条各两次断网重放，结果摘要一致、网络调用0。回执为主仓忽略目录`.recovery-artifacts/m31-2026-10-07/lot-current-acceptance-checkpoint.json`、`lot-protected-state.json`及`lot-existing-runs-replay.json`。源码未再次修改或部署；沿用LOT-5未变化的定向测试与构建证据。

## 一致性复核与剩余条件

最终结论：当前选择富途的LOT范围通过，无活动验收义务。LOT-AC1由实际配置/目录/路由页面持有，LOT-AC2的适配和主备选择由确定性测试持有；富途额外通过真实静态资料读取。LOT-AC3的实际查询、失败保护、草稿/确认、采用值/默认值和冻结重放/页面下载均通过。LOT-AC4的本地验证与开发目标证据分开记录；源价格资格和已有快照保持，长桥未配置、不记实读。

真实富途验收、当前路由修订56及两条新任务见[最终证据](../../tasks/evidence/2026-10-08-security-lot-size-live-acceptance.md)。默认/覆盖独立复算及两次断网重放、31条旧任务保护、实际页面及两份下载深比较通过。本轮仅修复必要展示文案和维护验收脚本，9项受影响测试、类型/构建/定向Lint/边界通过；未变化门禁沿用，当前无未完成复选框，Task归档。已归档P6边界不重开；未来用户选择长桥时，按其实际授权另验来源，不推定本次已实读。未提交、推送或重建镜像。

## 测试及修复记录

DSA 定向组合为 `test_security_lot_size.py`、`test_security_lot_size_routes.py`、凭证、普通已配置路由、连接检查、启停和凭证运行时相关测试，共 109 项；其中新适配器／路由 39 项，SDK 替身不代表真实券商数据。

Schema 为 `backtest-research-lot-size.test.ts`（15 项）；Server 为 `security-lot-size.test.ts`、`security-lot-size-transport.test.ts`、`backtest/v3-hk-research-lot.test.ts`（16 项）；Desktop 为新独立路由交互、原每手编辑、凭证和路由 UI 测试（26 项）。测试覆盖主源成功不访问备用、主源失败只调用所选备用、无隐藏回退、错误标的、非法股数、缓存原时钟、预算坐标、旧预设和参数编辑。

过程中修复了 `RequestInit.signal` 的可选类型错误、类型导入 lint，以及真实 HTTP 中错误地用日线嵌套错误合同解析静态资料平面错误的问题。最后一项新增传输测试，并在最终同步后核对 503 提示恢复正确。Desktop 构建仍有 bundle 大于 500 kB 的构建告警，本轮未扩展为打包优化。

## 使用与交付边界

配置流程与DSA适配说明见[DSA每手股数指南](../../../../daily-stock-analysis/docs/thesis-ledger-security-lot-size.md)。富途本轮不包含报价、K线、账户导入或交易；历史整手原件与全市场历史原价不在范围。用户本次授权的富途连接/启用和独立每手选源已保存，其他原路线及旧结果保持；所有并行WIP保留，未提交、推送。当前没有待配置验收项，不迁入TODO、不重开已归档P6，镜像交付不属于本Task的开发同步验收声明。
