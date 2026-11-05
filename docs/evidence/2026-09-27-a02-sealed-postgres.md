# A02 封存访问与模型请求的隔离数据库证据

日期：2026-09-27。对应 `A02-sealed-pg`。本轮补齐实际持久化指标到模型请求的投影，以及封存访问/揭示生命周期数据库验证；A02 父项与全目标仍开放。

## 数据库到实际 SDK 请求

加强既有 `strategy-optimization-sdk-postgres.integration.test.ts` 的真实本机 HTTP 接收边界。在 PostgreSQL 的实验 baselineMetrics 与 prior candidate metrics/diff 中保存封存收益、未来日期、事件/行情字段、未来极值及自由诊断；实验使用有效 V3 归一化固定供应商序列配置。

生产 Candidate Service 经实际数据库查询、prompt 白名单投影、SDK 和本机 `127.0.0.1` HTTP 的实收请求证明：

- 封存收益/换手率、未来日期、事件/行情、未知字段及自由诊断均不进入 messages；持久化标签不能覆盖服务器认可的参数标签。
- 合法开发收益保留负值，数据缺口分类保留；不完整验证指标没有补造 totalReturn。
- baseline 与 prior candidate 使用同一投影合同；固定供应商序列明确声明不得描述为严格无前视样本外。
- 原有同指纹缓存、账号配置修订拒绝、取消拒绝、SDK 用量事实和 discovery 服务端装配验证仍通过。

这使用受控 SSE 模型响应，不访问真实模型或使用目标 AI 凭据；两个 SDK PostgreSQL 测试通过。普通/探索其他投影分支由本轮同时通过的既有 22 项定向测试覆盖，不以单个数据库样本概括所有协议。

## 封存访问生命周期

既有 `strategy-center-t06-postgres.integration.test.ts` 的三项实际 PostgreSQL 测试通过，覆盖多个状态场景：

- 部分批次技术失败后保持 testAccessStarted=true、testRevealed=false，固定原候选批次；候选详情、直接 Run 状态、结果组和读取资格继续受限。
- 重试只补原批次未完成候选，已完成 Run 不重复执行；晚到 attempt 结果不能覆盖当前状态，揭示批次与预选对象不可替换。
- 取消不揭示结果，冻结 Run 缺失拒绝完成；testing 租约过期后恢复，已完成候选复用，最终统一揭示。

生命周期测试使用受控 V2 Run 结果验证生产数据库状态及读取政策；它不证明 V3 Worker 的真实回测、行情/事件覆盖或收益数值。本轮 V3 配置证据证明模型语义标签和投影，不把这两层合称完整 V3 AI 实验验收。

## 环境与检查

只创建本轮带 `thesis-ledger.goal-test=a02` 标签的独立 `postgres:17-alpine` 容器，使用 tmpfs、不挂载业务 volume，随机 localhost 端口与专用数据库 `a02_sealed_fixture`。执行项目 `dev-database-rebuild.js` 显式开发入口，精确核对数据库名及 owner，初始化独立应用角色；完整结构为 19 份 migration、68 张表，head=`20260927090000_market_derived_series_snapshot`。

应用角色运行两份集成文件，5 项全部通过；既有投影/评价/失败分类/本机 SDK 执行器 22 项通过，两个范围不重叠，共 27 项。Server typecheck、修改文件 ESLint、代码 diff check 通过。只修改测试和说明，不需要重建或同步业务服务。

首次准备仅顺序执行 migration，未使用项目入口设置自动派生 head，检查失败；第一次重试碰到初始化临时 PostgreSQL 就绪状态。改用项目显式重建入口，并等待最终 TCP 就绪后第二次重试通过；前两次均未进入业务测试，每次只清理本轮容器。最终容器亦已按标签确认并清理，不再有本轮数据库进程。

日志：`/private/tmp/goal-a02-sealed-directed-20260927.log`、`/private/tmp/goal-a02-sealed-pg-retry2-20260927.log`、`/private/tmp/goal-a02-sealed-pg-typecheck-20260927.log`、`/private/tmp/goal-a02-sealed-pg-lint-20260927.log`。可复现入口：`/private/tmp/goal-a02-sealed-pg-20260927.py`。

## 仍需完成

`A02-sealed-pg` 完成。A01/S07/S08 与真实来源/Worker 前置、真实 Provider 的 G-AI 门禁未由本轮证明，A02 父项继续开放；原 AI SDK G1 请求失败预算保持原记录，没有新增真实请求或恢复其执行。后续继续其他可执行剩余任务，完整范围不缩减。
