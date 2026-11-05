# 研究V2实源交付故障与准备截止验收

## 结论与运行面

RF-AC1～RF-AC6已取得通过证据。实源准备截止与部分材料生成均使用现有Server容器的实际编译模块、独立HTTP实例和所属隔离PostgreSQL；不是主实例新增报告。主实例的默认、Provider配置和业务数据保持。研究工作台其余实现、真实新闻成功研究、目标在途重启和浏览器验收按匹配输入复用。

对应[验收规格](../specs/2026-10-31-research-source-fault-acceptance.md)、[所属任务](../archive/tasks/2026-10-31-research-source-fault-acceptance.md)和[工作台总任务](../archive/tasks/2026-08-25-ai-research-workbench.md)。执行包为`.recovery-artifacts/research-source-fault-20261031T024029Z`，入口指针为`.recovery-artifacts/research-source-fault-current.json`。

## 单源授权与续验

用户本次明确授权仅同花顺`hithink-news-stock-timeline`、`600519.SH`、2026-10-24～10-31元数据，前置最多1页10条，维护入口生效起续验1小时。一次物理实读HTTP200、10条，观察时间为北京时间2026-10-31 11:09:50；没有重发，也没有模型调用。

随后通过infra维护入口`nvidia-news-admission.mjs`的`--renew-existing --roll-recent-window`执行plan、apply、verify，三者均通过。精确旧版本4、旧摘要`8d22ba50c7746dfd429c3c89ca66e19c80fa63e29729d288538605a444ba1dd4`，更新为版本5、摘要`e155d392cd3b3ca77ec1f6d5a632042f36888b7623e1b66d9c7b43cc6b735dd4`。

生效窗口为北京时间**2026-10-31 11:13:51～12:13:51**，即`validUntil=2026-10-31T04:13:51.305022+00:00`。新增证据摘要`dc205b1e2a8f8dc03ff1f35c86bf9ea147fc64d14913e7209660692dee9016eb`。其他8条准入、政策/来源凭据表和历史证据文件保持；没有修改来源启停、路由或默认。验收结束不再延长该窗口。

证据：`news-source-validation.json`、`news-renew-command.json`、`news-renew-apply.json`、`news-renew-verify.json`、`source-renewal-protection.json`。两个后续样本各消费一次真实DSA新闻接口、各返回该获准来源10条；这与前置一次物理实读分别计数，不声称每次DSA消费都绕过其正常缓存。

## 样本B：实际准备共享截止

北京时间11:18:27开始；新闻接口实际返回HTTP200、10条后，中继保持交付至调用方取消。沿用实际DSA的120000ms配置和准备共享30000ms，没有缩短或加速时钟。

- 总耗时`30018.836388ms`，实际HTTP408，错误码`RESEARCH_PREPARATION_TIMEOUT`。
- 隔离库AiRun、Tool、模型请求均为0，没有提交报告。
- 实源响应完成时间`03:18:28.006Z`；交付连接于`03:18:57.339Z`关闭，`completed=false`。

这证明准备阶段截止和取消收敛；生成阶段600秒、Tool的20秒策略继续各自独立。

## 样本A：实际部分材料与Cloudflare

紧接B执行。真实新闻接口于`03:18:57.954Z`返回HTTP200、10条后，中继主动断开该交付，价格材料正常。故障属于本地交付注入，没有改写源站内容，也不称为源站自然故障。

冻结包的价格材料可用，保留`quote_route_revision_unrecorded`；新闻材料为`unavailable/usable=false`，保留`news_empty_or_unavailable`、`news_service_unavailable`和`service_unavailable`。核对冻结包后才执行原SDK及V2生成合同。

- 隔离研究`7349919c-b735-4018-b905-e15f659a4fb0`，唯一请求`eedc0370-9965-491b-9e1e-cb6726c11849`。
- 请求及实际模型均为现有Cloudflare `@cf/qwen/qwen3.8-27b`，Chat Completions/JSON Mode/流式；请求1次、attempt1、无重试或回退，约43.22秒，终态`succeeded`。
- 原`research-generation-v2`校验及引用关联通过；2条断言、2条数字、1份价格绑定，1条真实价格Tool且状态`ok`。没有为不可用新闻制造失败Tool或引用。
- 数字分别为价格字段`/price=1392.05 CNY`与`/previousClose=1354 CNY`，均通过原字段来源校验。
- 报告`quality.status=partial`，保留上述新闻及行情缺口。带真实身份/范围的报告详情、evidence和Tool接口均返回200；报告与持久化结果完全一致，引用反读绑定同一Tool，反读不重新请求来源或模型。

原SDK实报输入/输出Token为`4129/1769`，`usageCompleteness=reported`、`settledRevision=1`。费用为`estimated 0 USD`、来源`frozen_provider_pricing`；没有上游实际账单证据，不提升为实报零费用。预算依据为用户确认的Workers Free，仅隔离进程内存采用本叶零费用费率；目标标准价格、保存配置和默认保持，未升级或充值。

主要证据：`live-01/proof.json`的`timeout/frozen/run/tools/http/events`以及`live-01/receipt.json`。原流式响应记录HTTP200、640119字节及摘要`55ef981d4e5f2d895889d29e18ceb6a45019fb6154231364844421c4b8f3dc7e`；只保留元数据及摘要，不据此声称持有完整原始响应制品。

## 分层验证与失败事实

维护入口为`scripts/research-source-fault-acceptance.mjs`；默认plan为零Docker变更、零凭据读取、零外部调用。局部Node边界8项通过；6个脚本语法和Prettier通过。项目ESLint忽略`scripts`，忽略告警没有被计作lint通过。本次没有生产源码、依赖、Schema或镜像输入修改，因此不重跑无变化的包级构建、生产镜像或原浏览器验收。

controlled-04通过实际HTTP/SDK/全部迁移构建的PostgreSQL：完整准备期限30019.62ms，随后一次本机假模型及V2、报告/引用反读通过，真实模型0次。最初三个受控样本分别暴露数据库初始化探针竞态、目录市场SH/CN混淆、结果应从`inference`读取的验收断言错误；相应入口已修正，原失败证据不覆盖，均未消耗实源或真实模型预算。

live-01一次通过，关键21个目标编译模块摘要与宿主产物一致；全部36个migration输入摘要为`63d22b4054573708bcc758af69744d116ef57505639ee9a29583ae157df6dfc8`。所属资源`ledger-research-source-fault-ec902573`和`/tmp/thesis-ledger-research-source-fault-ec902573`在完整导出后通过维护入口清理，随后只读检查确认均不存在。

## 数据与配置保护

模型凭据只在原Server容器内存解密，不导出宿主或写入隔离库。隔离库只复制公开标的必要字段，身份为临时测试主体；没有复制真实账户、账本、持仓或成交。目标数据库只读事务读取现有Provider和公开标的，缓存端口使用所属未命中实现，不写主Redis。

最终对账全部通过，快照晚于live终态：

- 41张目标表聚合完全相同；12张业务/审计表共598条逐ID摘要完全相同，657条既有健康审计完全相同。
- 5份Provider完整配置、密文及验证元数据保持；研究默认仍为修订7、`openrouter/openrouter/free`，OpenRouter的`modelDefaults={}`、`modelReasoning={}`保持。
- 来源在续验后的表、准入和证据文件与live结束后完全相同；授权差异仅上述一条4→5及新增一份证据文件。
- Server ID/镜像保持，Server、DSA、Backtest Worker均healthy；没有重启主服务、构建或发布镜像，主库活跃AiRun为0。
- 三仓HEAD与索引摘要保持，暂存文件0；DSA和infra工作区状态计数保持。本次写集限于验收入口、所属Spec/Task、证据和必要导航/归档引用，不提交或推送。

证据：`database-before/after.json`、`providers-before/after.json`、`business-before/after.json`、`source-before.json`、`source-after-renewal.json`、`source-after-live.json`、`defaults-after.json`、`runtime-after.json`、`git-before/after.json`与`protection-verdict.json`。

## 最终一致性评审

RF-AC1～6逐项复核通过。工作台原23项AC的实现映射、D59/D60的现行V2与Web、真实新闻成功研究、目标在途重启和当前实源故障/准备截止分别拥有对应证据；未用受控层替代真实层，也未因V1→V2迁移删除原义务。

工作台总Task及当前验收Task完成后归档，当前Spec继续有效，旧路径仅保留兼容跳转；相关当前导航和父项依赖同步。其他AI配置/SDK费用、协议及真实上游期限/停顿矩阵仍由其现行Task持有，不因本次研究验收关闭，不新增TODO来转移当前缺口。
