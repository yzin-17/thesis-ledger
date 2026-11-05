# 研报长期按需读取验证证据

> 日期：2026-10-23
> 当前状态：已完成；目标无日期采集、标准错误合同、新旧历史与原数据保护全部通过
> 任务：[已完成长期按需读取](../../archive/tasks/2026-10-23-research-report-on-demand.md)
> 规格：[长期按需合同](../../specs/2026-10-23-research-report-on-demand.md)

## 实现范围

当前代码对全部已支持沪深股票取消临时验收记录依赖，使用显式路由、来源启停/配置代次及当前绑定修订判定；日期可以省略或单边筛选，省略时不向来源发送日期字段。新业务响应使用 v2，旧 v1 快照继续独立校验。没有修改数据库结构、政策、来源配置或凭据。离线验证不访问来源；更新后仅发起下述一次标准业务采集请求，其结果未通过。

## 已通过检查

- DSA `tests/test_report_metadata_page.py`、`tests/test_report_metadata_http.py` 初次定向 59 项通过；连同能力注册和东财合同的相关回归共 410 项通过。随后补充实际控制面、注册表、执行器到 HTTP 的沪深无日期请求验证，HTTP 文件 24 项全部通过，临时准入表仍为空；未使用外部网络。
- 共享 schemas 的 `test/research-report-metadata.test.ts`：17 项通过；`pnpm --filter @thesis-ledger/schemas build` 通过。
- Server 的 `test/report-metadata.test.ts`：12 项通过；`pnpm --filter @thesis-ledger/server typecheck` 通过。覆盖无日期采集、旧 v1 本地读取、新消费拒绝旧协议/错误修订及已有历史保护。
- DSA 项目虚拟环境下的 `./scripts/ci_gate.sh deterministic` 通过，包含能力边界、运行时输入、数据测试范围及语法相关检查。
- `pnpm --filter @thesis-ledger/server build`、`node scripts/check-boundaries.mjs` 及 7 个受影响 DSA 文件的 flake8 关键错误检查（`E9,F63,F7,F82`）通过；未修改数据库结构，复用既有 36 migration/实际 head 及隔离 PostgreSQL 证据，不重复升级结构或运行隔离数据库。
- 定向验证发现并修复了政策对象原地变化时初始修订引用不稳定的问题；执行前固定政策修订，政策或来源变化时丢弃结果。

## 单项超时与确认后复核

`pnpm --filter @thesis-ledger/schemas test` 运行 111 个文件、1317 项：110 个文件及 1316 项通过，唯一失败为 `test/market-cash-assessment-v3.test.ts` 中“DSA实际新规范化输出与主仓合同逐字段一致”，触发原有 5000 ms 测试超时。该文件未修改。未降低超时门限、未重跑其他方案、未继续更高层级构建或 Docker 更新。

用户确认“单独重跑，通过后继续更新和验收”。执行 `pnpm --filter @thesis-ledger/schemas exec vitest run test/market-cash-assessment-v3.test.ts -t 'DSA实际新规范化输出与主仓合同逐字段一致'`，唯一选择的测试在 1334 ms 通过，其余 9 项因名称筛选未执行；原 5000 ms 门限及源码均未改动。结合全包原有 1316 项通过证据完成复核，不声称同一全包运行全部通过，不重复运行全包。

继续正式完整更新与目标验收。目标仍是保留数据、原来源启停及原 20 条路由；旧快照 `e7a946d5-f576-4e8b-8bae-c8ebfb1426b7` 的已验摘要 `75eea2bb1b8092553459e150b27ded2f60020d9c624864522f6fc5b81faacbe2` 应在更新后再次核对。

## 更新前保护基线

本轮只读基线为 30 个来源、196 个目标、政策修订 173 的 20 条路由及结构 head `20261023010000_report_metadata_snapshots`。DSA 9 条来源配置摘要为 `a4bccdba6de9a29305fc2c5dc258737fb1b9124fc256e88138a994ec710316fa`，来源配置视图摘要为 `9e08e296493cd5a7c4fb25b8f879ae349c13e20956faadce15229c4f91fa0a7f`。本轮没有写来源、政策或原业务数据。

部署前现有 Account 为 18 条，Asset 4、Trade 15、CashBalance 11、PortfolioSnapshot 6、Strategy 91、StrategyVersion 92，四张研究/日志保护表为空。以本轮更新前实际快照作为保护基线，不回滚其他聊天此前的增量；更新后逐表比较数量及全部行摘要。原数据卷挂载一并核对。

## 完整更新与保护结果

- 在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh all`；北京时间 2026-10-23 14:42:01 开始，15:00:42 完成，退出 0，用时 1121 秒。通过正式完整更新入口，保留数据库与原数据卷；本轮不改变数据库结构。
- Server/Worker 新镜像 `sha256:a8239800eab2d7c8c031848634a429b3f75293bf5075f53580bcf01342f3a04a`；DSA 新镜像 `sha256:7bd9601a6cd3319cacee3f7f8c7b06b289a86cce5d98a9fef585a7585c1c2df4`。5 个服务均 healthy；PostgreSQL/Redis 镜像及全部挂载保持。
- 独立更新后快照逐项核对：30 来源/196 目标、原 195 条能力全部摘要、来源配置视图、9 条来源配置行、政策及历史投影、11 张受保护表全部行摘要、结构 head 和规范化挂载全部相同；原 20 条路由与修订 173 保留。来源启停仍为 AkShare/Tushare 启用，TickFlow/Finnhub/Alpha Vantage/Longbridge 停用，凭据未改。
- 更新后旧 v1 快照 `e7a946d5-f576-4e8b-8bae-c8ebfb1426b7` 的 GET 为 200，原内容摘要保持 `75eea2bb1b8092553459e150b27ded2f60020d9c624864522f6fc5b81faacbe2`。
- 本轮更新日志为 `/tmp/thesis-ledger-report-on-demand-update-20261023.log`，SDK wheel 编译/打包占主要等待阶段；没有启动第二轮构建或改用其他更新入口。

## 首次目标验收卡点（已解除）

保护核对通过后，仅执行一次 `POST /api/market-data/research-report-metadata/collect`，输入为 `instrumentId=86b1de50-d50d-4007-84c0-918e7e5409ca`、`page=1`、`pageSize=2`、`requestBudgetMs=3000`，没有 start/end。Server 返回 HTTP 503，规范错误为 `invalid-response`，消息“DSA Data V3 错误响应无效”。尚未取得通过校验的新 v2 快照，无法据此判断底层为上游返回问题还是错误封装问题，也未证明真实无日期读取。

按用户要求在新卡点停止，没有重试采集、切换来源、扩大预算或修改启停/路由。下一步建议只定位本次请求的 DSA/Server 错误响应及既有日志；确认后修复该问题并重跑同一单页验收。RO4/RO5 保持未完成。

## 用户确认后的最小修复

用户确认“定位并修复，再验同一单页”。只读核对既有日志与 DSA 健康记录，定位到北京时间 15:03:47 的实际来源错误为 `upstream_failure`，熔断 closed、连续失败 0；不是 `not_admitted`。研报入口复用了旧顶层 code/message 信封，而 Server 严格要求 Data V3 的嵌套 error，导致真实错误被遮住。

修复仅让该入口复用既有 `market_data_error_v3` 与 `market_runtime_error`，保留 Server 严格校验和同一 requestId。传输诊断只保留 requestId、稳定错误码、HTTP 状态或异常类型；不记录异常文本、URL、原始响应、头或凭据。未改成功响应版本、日期语义、来源、预算、启停或政策。

离线定向验证：DSA 72 项通过，扩展相关回归共 423 项通过；确定性门禁和关键 flake8 检查通过。Server 13 项通过，其中新增跨仓测试实际运行 Python HTTP 错误入口，再由 Server 当前映射器解析 5 类错误，确认来源故障、格式错误、权限、来源认证与请求错误语义可传递，来源私有文本不外泄。此前已通过且输入未变的 schemas、Server 构建与数据库证据继续复用；修复尚待 DSA 正式完整更新及同一无日期单页重验，不能据此标记实际来源恢复。

修复更新前再次只读采集实际基线：来源/政策与上一轮相同，Account 18、Trade 16、CashBalance 12，其余表数量保持；此前已发生的业务数据增量原样保留，以本次更新前完整行摘要核对后续保护。此次源码仅改 DSA 的研报入口及传输诊断，正式更新目标为 dsa，Server/Worker 镜像继续复用。

## 修复部署与数据保护差异（用户已确认）

在 infra 目录执行 `DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh dsa`，北京时间 2026-10-23 15:32:23 开始、15:42:58 完成，退出 0，635 秒。DSA 新镜像为 `sha256:45466d07814fc05fd806bc954951e0b4d5e15d20bfee6c7ec2f85cc8e6003461`；Server/Worker、PostgreSQL、Redis 镜像保持，5 个服务 healthy。日志：`/tmp/thesis-ledger-report-error-repair-update-20261023.log`。

只读核对目标文件：`api/thesis_ledger_report_metadata.py` 的 SHA-256 为 `49d77caeb7ef7d26e2738644809b0a9b7dc53e1b7dd4f6091a497c7e88be07a7`，`data_provider/eastmoney_report_metadata.py` 为 `33821a9ef05acbc36c3906f89f23a5c933664f8d5bfdfde16716e0c46e2ffff6`，均与本轮源码一致。

来源 30/目标 196、原 195 条能力摘要、来源配置视图及 9 条配置行、政策与历史投影、结构 head、所有数据卷挂载和其他服务镜像的保护核对通过。原 20 条路由和来源启停不变。

新的保护差异：Trade 仍 16 条，摘要 `1f56c9ace484d4ed20f0935f66d368fe` → `86dbd5f21d87e020015e268837298a10`；CashBalance 仍 12 条，摘要 `3e4a91d8f4ce8ccd0c06102b4a61038f` → `79ada3b7b98a7008d7a01df857ad1beb`。其余 9 张受保护表与本轮更新前相同。本聊天未发起 Trade/CashBalance 写入，原因尚未确认，不能直接接受为预期改动或重置基线。

单次只读 SQL 仅查询更新前基线之后的记录标识与时间，不查询金额等业务字段：`510300.SH` 的交易投影记录 `trade:trade-projection-v1:592632c1-320b-468b-801f-f4731ba26792:510300.SH:ee1cc309-4545-4846-9b8c-5546f45539ed` 的 createdAt/updatedAt 均为北京时间 `2026-10-23 15:45:17.912`；现金余额记录 `116c42bf-fe1d-5162-81dd-43cd7dd27be6` 均为 `15:45:17.994`。时间发生在完整更新结束后的核对阶段；尚未确认其业务来源或预期性。

按用户要求停止，尚未执行修复部署后的真实单页请求。待用户确认这两表变动是否为本人或其他聊天的预期修改，再继续同一标的、单页、原 3000 ms 预算的实源验收；不重建已通过镜像或重跑未变的高成本检查。

## 预期数据确认与无日期来源协议修复

用户确认 Trade/CashBalance 为预期修改，要求保留并继续；按确认接纳现有结果，没有恢复旧数据或重建已经通过的镜像。复用现有部署执行同一无日期单页请求，Server 标准响应已正确传递为 503/unavailable、“行情上游暂时不可用”。安全诊断定位同一请求 `8e66fbe0-e6d6-4702-aa3d-d7ec2e256542` 的来源 HTTP 状态为 400；原错误信封问题已修复，但来源读取仍未恢复。

针对同一底层参数问题，只进行一次当前接口的空字段协议核对：同一 600519.SH、第 1 页/2 条、3000 ms，beginTime/endTime 均为空字符串，其他参数和来源保持。宿主机标准元数据解析在 87 ms 返回 200、2 条、总数 772；请求及结果 start/end 均为 null，historyComplete=false。引用为 `eastmoney:report:AP202609211829719676` 和 `eastmoney:report:AP202608211828244348`。这仅证明来源接受空日期字段，不代替目标服务消费。

由此修正适配器保留必需空字段的表达，不填日期值、不改成功响应版本、来源、预算或路由。HTTP 与传输测试相应核对 `keep_blank_values=True`；423 项 DSA 回归、13 项 Server 消费及跨语言错误测试、确定性门禁和关键 flake8 检查全部通过。接续仅使用正式 `update.sh dsa`，待目标新镜像通过后再执行同一标准 Server 单页验收。

## 最终部署与目标验收

在 infra 目录执行 `DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh dsa`，北京时间 2026-10-23 16:02:45 开始、16:17:27 完成，退出 0，用时 882 秒。最终 DSA 镜像为 `sha256:e6ab2bd78a9d7a424355e3bbbb43b4ec777cbf7967cda06245c51eac1b0eafec`；Server/Worker 继续复用 `sha256:a8239800eab2d7c8c031848634a429b3f75293bf5075f53580bcf01342f3a04a`。日志为 `/tmp/thesis-ledger-report-empty-date-fields-update-20261023.log`。

目标两处文件与源码 SHA-256 一致：研报 HTTP 入口仍为 `49d77caeb7ef7d26e2738644809b0a9b7dc53e1b7dd4f6091a497c7e88be07a7`；空日期字段适配器为 `c313b09a93ba784d4cc17f4c6b3620f9eff9d52454609a977c4306e042e4a587`。

北京时间 16:20:00 执行标准 Server 单页请求，输入仅含原 `instrumentId`、page=1、pageSize=2、requestBudgetMs=3000，没有 start/end：

- Server 采集 201，DSA 实际 HTTP 200，Server 日志耗时 403 ms。
- 返回 `research-report-metadata-v2`，适配/来源修订均为 v2；请求及结果 start/end 均为 null。
- 实际保存 2 条元数据，来源 totalItems=772、totalPages=386，historyComplete=false；只是单页结果，不代表全部历史已采集。
- 新快照 `2bf2be70-acfb-4218-89dd-000bd62ca1ac`，内容摘要 `5b9bdab3835caefda5e7e634339da1f425019a0229a561baa405f8e999fb2812`，请求标识 `eb11a15a-dfc2-412e-a3ff-05c4872685d9`；政策 173，实际目标 akshare/eastmoney、routeIndex=0。
- 新快照 GET 200、本地历史 GET 200；旧 v1 快照 GET 200、原摘要 `75eea2bb1b8092553459e150b27ded2f60020d9c624864522f6fc5b81faacbe2` 保持，新旧内容均与各自采集结果完全一致。稳定引用为上文两条来源引用。

目标采集后再次独立核对：30 来源/196 目标、原 195 条能力、来源配置视图与 9 条配置行、政策及全部历史投影、11 张受保护业务表完整行摘要、结构 head、数据卷挂载均与最后一轮更新前相同，5 个服务 healthy。Trade/CashBalance 的业务字段摘要也一致；最终完整行摘要本身已相同，没有使用排除审计时间字段的结果替代保护门禁。用户此前确认的并发修改原样保留，Account 18、Asset 4、Trade 16、CashBalance 12、PortfolioSnapshot 6、Strategy 91、StrategyVersion 92，其他四张保护表为空。

目标 Server/DSA 自最终更新完成后的日志无缺表错误。来源启停仍为 AkShare/Tushare 启用，TickFlow/Finnhub/Alpha Vantage/Longbridge 停用；20 条路由与修订 173 未写入，凭据未改。模型、移动端、Longbridge 与其他原阻塞条件保持。

## 验收结论与复用范围

当前已支持的全部沪深股票可沿现有目录身份长期按需请求，日期为可选筛选；普通业务就绪由显式政策路由、来源启停及绑定版本控制，不再依赖旧 24 小时、固定股票/日期范围的首次验收记录。单标单页、预算、撤销/控制变更与版本校验保持；不自动抓取，不承诺来源全历史。

423 项 DSA、13 项 Server 及实际 Python 错误合同、确定性/关键静态门禁均通过；共享 schemas 定向 17 项、包级原 1316 项及原门限下单项复核、Server build/类型检查/导入边界、未变数据库和重启留存证据按输入复用。最终目标成功后未重复请求来源或构建镜像。长期按需切片完成，不代收研究 G3、历史比较或其他父项。

## 文档收口

本任务已移至 `docs/archive/tasks/2026-10-23-research-report-on-demand.md`，RO1～RO5 及最终一致性核对全部完成。基础规格、长期规格、来源合同、适配矩阵、模块盘点、TODO 边界、总表、归档索引与 infra 使用说明同步；11 份相关说明的本地相对链接、尾空白和旧活动 Task 引用检查通过，三个仓库本轮写集的 `git diff --check` 通过。文档修改未改变源码或运行态输入，不重跑已通过的高成本检查。

按现行总表再次核对，其他非移动端活动项继续受原模型/预算、来源身份与权限、合格历史输入或通知授权条件限制；Longbridge 与 RQData 保持原暂缓决定，一致预期/EPS 仍由独立 TODO 管理。本切片归档不表示这些父项或原总目标完成。
