# 研究 HTTP、DSA 与 PostgreSQL 受控联通证据

状态：G1 已完成受控联通。全部来源、模型响应与数据库均为隔离受控输入；未调用外部 Provider、真实模型或目标运行态。

## G1 前置与入口

DSA N1～N3 已交付正式新闻合同、指定来源执行、默认关闭/精确准入和认证 POST。新增 `dsa-process.fixture.py` 与 `research-dsa-process.fixture.ts` 启动真实数据 app 与生命周期：仅把腾讯 ETF 原始传输改送本地 HTTP，SearXNG 使用显式本地实例；实际 Provider 解析、Registry、策略、报价/新闻 DTO、缓存上下文和主仓客户端均保持。控制库、公开目录、ENV_FILE 位于限定前缀的临时目录，停止时检查模型/通知导入与残留子进程。

主仓沿用实际 Nest 研究提交/读取、Prisma、AI SDK 执行与计量模块。既有测试装配仅增加数据入口注入和基于真实冻结证据的受控生成内容；模型仍通过本地兼容 SDK/SSE 响应，不写入固定最终报告。

## 退回生产者的 D2f 修复

首次正式隔离 PostgreSQL 联通执行全部 34 项 migration，数据库 `ai_provider_concurrency_fixture`、owner `fixture_owner`。低层报价/新闻 HTTP 成功；研究提交正确拒绝，原因为 `quote_material_unqualified`（同时保留既有 `quote_route_revision_unrecorded` 警示）。没有创建模型任务或降低材料门槛。

进一步将主仓实际 MarketQuoteReader 加入低层预检：价格、时钟、新鲜度正常，但 CNY 单位缺失。DSA 原生腾讯 ETF 结果已经声明 `price_currency=CNY`、量额单位 unknown；来源没有公开单位策略，且 Native 报告的 `tencent/tencent` 没有规范别名，标准 QuoteResult/HTTP 丢失来源与单位。补充 HTTP 断言后先复现缺失 `upstreamSource`。

修复归属 DSA D2f：只增加该精确 ETF 端点的 Native 别名及明确单位投影；缺失、不匹配、其他来源或误称已知量额仍拒绝。量额继续 null/unknown，没有按代码猜币种。Adapter 修订从 `tencent-etf-basic-quote-v1` 升至 v2，上游协议仍为 `tencent-etf-single-symbol-v1`，缓存身份随实际消费合同变化。

验证：新增六项标准结果/拒绝断言并补原 HTTP 证明；报价、来源别名、单位、其他股票/外盘与 Registry 共 468 项通过，缓存上下文 16 项通过。主仓实际 DSA 客户端及 MarketQuoteReader 预检通过：CNY 到达消费面，未知量额保留；该预检不使用 PostgreSQL，其五个 G1 持久化场景仍显示跳过。DSA syntax、critical flake8、deterministic 门禁通过；既有样式债务未作广泛格式化。没有目标更新、实际来源调用或业务数据变更。

## 正式持久化与执行结果

从主仓目录执行既有入口：

```sh
node scripts/test-ai-provider-postgres.mjs \
  test/research/dsa-g1-http-postgres.integration.test.ts \
  test/ai/research-execution-v2-postgres.integration.test.ts \
  test/ai/research-execution-v2-lifecycle-postgres.integration.test.ts \
  test/research/submission-http-postgres.integration.test.ts
```

退出 0；实际 34 项 migration、4 文件 31 项通过，其中 G1 为六项（一次低层预检与五个持久化场景），既有研究提交/执行/生命周期 25 项通过。脚本使用 tmpfs 的独立 PostgreSQL，不影响目标容器；结束后正式脚本移除自有容器，DSA 生命周期/取数进程与临时目录均正常释放。

G1 的规范证券为 CN ETF `510300.SH`，主仓和 DSA 均使用相同公开身份。并发三次相同提交保存一条根任务、只投递一次；准备阶段零模型请求，冻结材料包含实际腾讯报价与 searxng 新闻的单位、时钟、来源和修订。受控模型通过既有 SDK/SSE 执行一次；实际审计绑定两份冻结材料，输入指纹/范围保持；持久化八个输入 Token、五个输出 Token、一次请求与一次结算，`0.07 USD` 仅为受控 SSE 计量事实，不代表真实费用。

历史与引用使用保存的冻结材料；撤销当前新闻准入后仍可读原报告，错误模式不可读，读取不发起数据或模型请求、不改写任务。非法模式和必需新闻未准入均不创建根任务。错误数字确由冻结数值核对拒绝，保留一次已收到的调用/费用；取消由真实 HTTP 先写数据库，再中断 SDK，晚到响应及再次执行不能覆盖终态或增加请求。

修复测试装配中的固定样例引用时，将结论、数字、失效条件和下一步的引用全部绑定本次冻结身份；没有修改生成业务校验器或最终报告。该装配还验证了旧标的/证据引用会被业务规则拒绝。

专属入口在创建 Docker 资源前检查相邻 DSA Python 环境；明确选择 G1 时自动设置 `RESEARCH_DSA_INTEGRATION_TEST=1`。单仓普通测试不代收该跨仓门禁；单独低层预检须显式设置该变量。Server typecheck、四个受影响 TS 测试文件 ESLint、导入边界通过；Python 装配完整 flake8 为 0。V2 目标写入开关、真实来源/模型、目标升级/恢复和 DG1 的完整物理无 LLM 环境均不由本门禁完成。
