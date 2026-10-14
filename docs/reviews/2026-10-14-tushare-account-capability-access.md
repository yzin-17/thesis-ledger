# Tushare 账户功能权限提示验收

所属任务：[unified-data-capability-adapter 的 TA 执行包](../tasks/2026-10-09-unified-data-capability-adapter.md)。本记录仅提供证据；当前状态由原 Task 维护。以本地未提交工作树为事实源，保留并行修改，未提交、推送、发布或写真实 Ledger。

## 产品与来源依据

用户选择保留功能名称与禁用原因。当前凭证已确认可访问的功能允许新选择，明确拒绝显示“当前账户缺少权限”；未检查、超时、限频和坏响应保持“权限待验证”。已保存的主备配置保留。

[Tushare 权限说明](https://tushare.pro/document/2?doc_id=290)区分积分与独立接口权限，不能从积分或一次日线成功推定其他接口。[HTTP 协议](https://tushare.pro/document/1?doc_id=40)说明 `2002` 为权限问题；`40203` 只有明确权限拒绝内容才归为缺权限。[fund_div 输入说明](https://tushare.pro/wctapi/documents/120.md)列出四选一条件，本次使用单基金代码，不组合未经确认的窗口或分页参数。

六个精确功能对应 `daily`、`hk_daily`、`fund_daily`、`rt_k`、`cyq_chips`、`fund_div`，接口差异由 DSA Tushare 来源模块拥有。普通检查与账户检查通过 `purpose` 分开，Server 和客户端都核对响应用途；账户报告不能冒充数据读取成功。空列表仅证明本次接口请求被接受，不证明数据质量、覆盖或没有分红。

## 实现边界

- 复用原 HTTP 传输，按职责提取到 `data_provider/tushare_http_client.py`；保留 Fetcher 原导入、请求/十进制行为及既有回归。结构化错误只供来源解释，不向页面返回原错误或凭证。
- 每个用户动作最多六次只读请求；单接口最多3秒、总执行预算18秒、无重试，复用现有后台检查数量限制。Server 对该用途限定22秒外层预算，普通请求仍使用原配置超时。
- 草稿凭证只通过组件闭包发起请求，不进入 mutation variables、Query key 或持久化。当前账户报告只在运行时内存保留5分钟；缓存存不公开的随机密钥摘要与标准结果，不留存凭证副本。Token、实际端点、配置代次变化使旧结论失效，过期清除结果，重启后待验证。
- 来源功能说明、权限侧栏与新路由选择使用标准状态。更换输入撤销旧草稿结果，保存后仅检查当前配置。内部目录刷新不自动请求供应商，也不启用来源或改主备。
- 未修改数据库结构、现金资格、应收/发放模型、冻结快照或旧结果。HiThink、东财、TickFlow 已通过的数据适配与复现证据继续复用。

## 离线与构建验证

以下上游响应为离线协议验证，不是供应商真实成功：

| 输入范围 | 最后结果 |
| --- | --- |
| 新账户检查、原 HTTP/精确检查、Tushare日线/事件/ETF/凭证及目录 | 264项通过；缓存摘要/过期及原检查/目录最终67项通过 |
| DSA工厂、Provider V3、隐式日线与消费者边界 | 29项通过 |
| 新控制HTTP接缝、混合权限、旋转、端点变化、预算、fixture与无凭证 | 14项通过；检查前后业务配置/健康/策略/准入表相同 |
| Schema精确检查及目录 | 12项通过 |
| Desktop凭证、权限、候选、旧诊断及刷新 | 41项受影响通过；最后权限/凭证10项通过 |
| Server精确检查、原控制服务及响应关联/超时 | 23项通过 |
| API客户端Control传输及用途关联 | 3项通过 |
| Schema/API客户端构建、Server/Desktop类型检查、Desktop构建 | 通过 |
| 仓库依赖边界、复杂度及文件尺寸ratchet | 通过；既有警告保留，不调整阈值或忽略项 |

关键混合结果为：内地股票日线可访问；港股日线、ETF日线和基金分红明确缺权限；实时行情超时、筹码坏响应保持未知。凭证无效、HTTP403未知、限频和响应损坏分别核对。并行轮换后迟到结果不发布；草稿检查不替换当前账户缓存。账户请求若收到普通读取结果，Server与客户端拒绝用途错配。

最后日志为 `/tmp/tushare-account-cache-final.log`、`/tmp/tushare-account-server-final.log`、`/tmp/tushare-account-api-client-final.log`、`/tmp/tushare-account-ui-final.log`、`/tmp/tushare-account-guardrails-final.log`。高成本检查只在相关输入改变后更新，未重跑完整历史样本或无关业务。

## 正式同步与实际消费者

正式 `thesis-ledger-infra/scripts/sync-code.sh all` 退出0，兼容性预检通过，DSA/Server/Worker健康；该阶段仅更新容器可写层，不作为镜像固化证据。日志 `/tmp/tushare-account-sync.log`。

真实 Server `POST /api/market-data/providers/tushare/test` 提交 `purpose=account_access`，HTTP200返回六个精确账户状态，均为 `credential_missing`，`attempted` 合计0；状态为 `unconfigured`，独立报告关联请求ID，业务 `capabilityResults` 为空。Tushare保持 `configVersion=0/enabled=false/credentialConfigured=false`，原策略响应逐值相同；20来源/143精确目录完整。证据 `/tmp/tushare-account-target-sync.json`。没有模拟供应商成功，也没有为验证保存Key。

实际浏览器 `http://127.0.0.1:5173/market-data` 数据源页显示Tushare六个功能与“检查功能权限”入口；启用开关禁用。权限侧栏显示六项“尚未配置凭证”和5分钟/覆盖边界说明；未输入凭证时点击检查仅显示“请填写 Token。”，不发供应商请求。混合权限及草稿保存/变更场景由前述离线UI验证覆盖，不冒充该目标账号已通过。

## 镜像固化与剩余条件

### 本次重试通过（2026-10-14）

用户要求“再试一下”后重新测量，正式预检为宿主29386MiB/要求20480MiB、Docker23947MiB/要求18432MiB，空间门槛通过。首次调用因执行环境找不到`node`在预检退出1，日志`/tmp/tushare-account-image-retry-20261014.log`；使用本机已有Node v24.19.0补齐该命令的PATH后，正式入口完整退出0，日志`/tmp/tushare-account-image-retry-node-20261014.log`。没有修改全局环境、脚本或空间门槛。

执行目录为`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，命令为`PATH="/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" rtk proxy bash scripts/update.sh all`。目标`all`对应本次跨DSA/Server写集；固定SDK源码编译、DSA前端及Server源码构建、生产运行依赖打包和数据库`check`模式通过。未执行清库、删卷、提交、推送或发布；更新后的运行态没有再使用代码同步覆盖源码。

| 核对对象 | 独立核对结果 |
| --- | --- |
| DSA当前镜像 | `sha256:3429d2609376a4a4d5d88117d7a6d142aa11147e323c006f8d2cdcc8169ed8d0` |
| Server/Worker当前镜像 | `sha256:6d709bc3766382c91f22e9f8054c402b7b42883bb2fe6c7d96f2f9cdb9ae3b68`，两消费者使用同一新镜像 |
| 实际运行状态 | DSA、Server、Worker、PostgreSQL、Redis五容器均running/healthy；本次构建期间记录的旧镜像身份分别为d9cdba416f1f…和71621979c96c… |
| 数据卷 | `thesis-ledger-dsa-data`、原logs/reports两匿名卷、`thesis-ledger-backtest-data`、`thesis-ledger-postgres-data`、`thesis-ledger-redis-data`共6卷；更新前后名称及挂载目标逐项相同 |
| 生产源码 | Tushare HTTP/Fetcher/账户检查/来源定义，以及通用账户合同/执行器/注册/精确检查/目录/Runtime共10文件，容器内SHA256与构建期间冻结且未变化的宿主源码全部相同 |
| 实际Server消费 | `POST /api/market-data/providers/tushare/test`，`requestId=tushare-account-image-retry-20261014`、`purpose=account_access`；HTTP201、status=unconfigured、6项credential_missing、attempted合计0、业务capabilityResults为空 |
| 当前配置及目录 | accountAccessSupported=true；Tushare仍enabled=false/credentialConfigured=false/configVersion=0。策略revision/dsaRevision=126、16路线，updatedAt仍为2026-10-13T19:40:40.033Z；本次账户检查前后策略逐值相同。注册20来源，`/api/market-data/routes/capabilities?contractVersion=3`返回complete/143条 |

实际账户报告采集时间为`2026-10-14T09:03:03.150107+00:00`，过期时间为`09:08:03.150107+00:00`。当前未保存凭证，所以此验收证明镜像中的真实权限控制链路和缺凭证零请求行为，未声称该账户有供应商权限。原定向测试、实际页面和既有现金/免费历史验收输入未变，直接复用；未重跑供应商样本、研究或未变化账号条件。

### 首次空间失败记录

首次正式 `update.sh all` 退出1，日志 `/tmp/tushare-account-image-update.log`。在拉取/构建前执行完整空间整备，已清空可回收BuildKit缓存，逐个退役Server `3e978118f765…`、DSA `51b6b86b755b…` 两份未引用、未保护历史回滚并复测/回收空闲块；最终删除候选为空。当时宿主17440MiB不足要求20480MiB，差3040MiB；Docker23948MiB已达到要求18432MiB。没有降低门槛或扩到其他宿主文件。

该次未拉取/构建或重建服务，DSA `d9cdba416f1f…`、Server/Worker `71621979c96c…` 保持；当时五容器健康、六卷及挂载保持，实际Server仍返回新账户控制，十个DSA生产文件与当时的`/tmp/tushare-account-source-hashes.json`匹配。其功能来自代码同步的容器可写层，该次不作为镜像固化证据。当前固化状态以上方本次正式重试和独立核对为准。

### 外部剩余条件

既有真实 `daily` 成功及 `fund_div/fund_daily/rt_k` 权限拒绝按[原凭证与原接口范围](2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)复用；本轮Tushare供应商请求为0，RQ账号/权益未复验。新凭证的真实权限结论须用户输入后由该检查取得，不能沿用原账号结论。

`H07-K37c-live`（无RQ账号）与 `H07-K37e-live`（Tushare基金分红权益拒绝、真实现金消费未过）继续作为外部剩余项。账户功能控制完成不等于真实现金消费或完整历史核验通过；整个主题仍不归档。
