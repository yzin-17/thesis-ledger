# T6 取消场景的隔离验收

责任入口：[原配置 Task 的 T6.CANCEL-ISOLATED](../archive/tasks/2026-09-21-ai-provider-model-usage-configuration.md#t6-cancel-isolated)。本记录保存本叶证据，原 Task 维护当前状态；完整 T6 不由本叶代收。

## 授权、基线与写集

2026-10-30 用户明确授权先统一 600 秒文档口径，再执行取消场景隔离验收：真实模型 0 次、费用 0，仅本机假上游和隔离数据，现有配置及 `modelDefaults={}`、`modelReasoning={}` 保持。

三仓 HEAD 为主仓 `da002744bd317b7754832c6ac41d169bcf005e27`、DSA `dd26571509e842ab230c393f5f339911ea98425d`、infra `3f661df1deb3de894755dcc66e584abb4165d014`，均有原有 WIP；执行前后 HEAD/索引摘要相同。主仓 710 份 Server 源码逐文件摘要保持；没有修改运行时代码、依赖、数据库结构、目标配置或启动标记。

本叶写集为：自动测试后保存 Spec 的现行期限表述、原配置 Task/索引、本证据；新增 `apps/server/test/ai/ai-provider-cancel-postgres.integration.test.ts`，既有 `ai-provider-postgres.fixture.ts` 增加可选 SDK 注入及所属 HTTP origin。默认模拟 SDK 仍供原回归使用，新样本注入真实 `AiSdkGenerationAdapter`，仅对调用做透传计数。

## 600 秒口径与验收范围

修正 Spec「实现边界与兼容」中残留的固定 300 秒，使其与验收第 9 项、已接受的 AE10 及当前验证计划一致：普通用途操作预算为 600 秒，按 `maxDurationSeconds` 冻结，全部用途共享同一期限；其他档位仍由 AE10 持有。该修正没有修改超时源码或目标运行参数，也没有改写历史 300 秒实验。

取消样本的公开计划实际返回 `maxDurationSeconds=600`、两个待验用途、默认最大 6 次及估算 0 USD。隔离操作使用失败即停的最小合法请求上限 2，禁止文本回退；实际仅发出第一用途一条本机请求。没有加速时间，也没有等待或声称通过完整 600 秒到期、首输出/间隔停顿或目标实机/真实 Provider 取消验收。

## 样本与隔离入口

- PostgreSQL 入口为维护脚本 `scripts/test-ai-provider-postgres.mjs`，执行目录为主仓根目录。脚本使用已缓存的 `postgres:17-alpine`、`--pull never`、随机所属容器名、loopback 随机端口和 tmpfs；36 份现有 migration 及 SchemaVersion head 检查完成。脚本与测试均核对数据库 `ai_provider_concurrency_fixture`、角色/owner `fixture_owner` 和本机连接身份，未指向目标业务库。
- 本机假上游、隔离 Nest HTTP 服务均绑定 `127.0.0.1` 随机端口。Fetch 只放行这两个所属 origin，并拒绝重定向；实际没有非所属请求。真实模型密钥/数据库 URL 不传入测试子进程，使用固定 32 字节隔离加密密钥和合成凭据。
- 两条隔离用途按顺序为 `strategy_authoring_analysis / authoring-analysis-v1`、`research / research-generation-v2`，均为 auto/native_schema，零配置价格。第一用途消息摘要为 `d2d2168c94f17df94b569fb588cd7e71954ddc9080ae5f5e042adcfaf99a8a9d`，与前项冻结样本相同；未新增账户、行情、新闻或业务提示。
- 隔离库原配置保留合成密文、两个空对象和空验证列表，研究默认修订为 7，并存有一条旧健康审计；待保存草稿将优先级从 100 改为 101，以便直接检出错误保存。原始整行比较包含密文、settings、health 和 updatedAt。
- 假上游返回真实 Chat Completions SSE，持续发送未终止片段；收到请求后调用正式 `POST /api/v1/ai/providers/:name/validation/cancel`。样本经公开 `test-and-save`、真实 SDK/HTTP 流与 PostgreSQL 完成，未模拟 SDK 结果、取消方法或持久化。

## 验证与实际结果

北京时间 2026-10-30 20:41，取消样本通过；操作 ID 为 `328d63b3-00ac-453b-8287-7e8171fdb796`。

| 断言 | 实际结果 |
| --- | --- |
| 公开取消入口收到在途操作 | HTTP 201，`cancelled=true` |
| 原测试并保存请求收敛 | HTTP 400，明确用户取消及原配置未修改 |
| 正确停止上游 | SSE 连接在样本清理前因取消关闭；实际 SDK 调用 1 次、假上游请求 1 条，`stream=true`、`response_format=json_schema` |
| 不继续验证或保存 | 第二用途、格式回退和重试请求均为 0；保存服务调用为 0，没有通过验证记录 |
| 取消审计持久化 | 独立 Prisma 连接读取同一请求的 pending/failed 两行；失败码 `validation_cancelled`，准确绑定第一用途/native_schema；操作授权意图仍保留 |
| 未知不补零 | inputTokens/outputTokens 为 null，usage.status 为 unknown；费用审计为 `estimated / configured_model_pricing / 0 USD`，没有冒称上游报告 |
| 原隔离数据保持 | ProviderConfig 全字段、密文、两个空对象、默认整行和旧审计完全相同，优先级仍为 100；AiRun/AiToolCall 均为 0 |

操作授权意图的追加记录保留原 `running` 值；本叶终态由同一请求的 `failed / validation_cancelled`、HTTP 400 和上游断开共同证明，不伪造新的授权意图终态。

本叶正式样本一条假上游请求；前置定向取消回归另使用一条本机假上游请求，均不连接真实模型。实际真实模型调用总数 **0**，计费金额 **0**；SSE 样本的未知用量没有填为零。

### 检查命令与故障记录

执行环境为 Node `v24.19.0`，本地缓存的项目 pnpm `11.9.0`，安装/版本下载关闭并使用 offline；依赖未安装或改写。

- 既有 `ai-provider-validation-lifecycle.integration.test.ts` 仅选「用户主动取消」：1 项通过，另 5 项未执行，不计入本叶通过数。
- 新测试/共享 fixture 的定向 TypeScript、写集 ESLint、Prettier 均通过；Server 运行时代码未变，既有业务构建、真实 Provider 与高成本门禁按匹配输入复用。
- 首次通过维护入口同时执行本叶及 `ai-provider-save-postgres.integration.test.ts`：5 项保存/竞争回归通过；本叶在造数阶段因测试驱动手填 Base64 密钥长度错误失败，尚未发送假上游请求。
- 修正为程序构造的固定 32 字节测试密钥，仅重跑本叶：1 项通过，0 跳过，测试本体约 219ms。首次日志保留，没有把首轮整体记为通过。

维护入口的实际 argv 分别为：

```text
/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-cancel-postgres.integration.test.ts test/ai/ai-provider-save-postgres.integration.test.ts
/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-cancel-postgres.integration.test.ts
```

目录、起止时间、非敏感环境限制、实际退出码及完整日志均在下述私有包中；两轮入口均执行所属容器清理，最终无该入口前缀的残留容器。

## 目标保护、审查与剩余门禁

目标仅做 READ ONLY 事务及 Docker 只读检查。39 张业务/配置保护表和额外两张健康表，合计 **41 张表的数量及摘要完全相同**；五份 Provider 配置、密文、验证元数据、旧健康审计、默认及两个空字段与修订均保持。AiRun 仍 15，AiToolCall 仍 165。本轮没有需要归属的后台数据增量，也没有恢复或覆盖目标数据。

五个目标容器 ID、镜像、挂载和相关启用标记完全相同；未部署或重启目标，没有 stage/commit。两个空字段的历史来源观察沿用前项记录，本次不回写或归属该旧变更。

本叶范围的最终一致性审查通过：真实 SDK/公开 HTTP/SSE/PostgreSQL 证据支持取消归因、终止传输、不继续用途、不保存及数据保护，原 Task 本轮仅新增勾选 T6.CANCEL-ISOLATED。完整 T6、完整冻结期限/停顿、目标运行态或真实 Provider 取消、其他协议/用途、非零费用及历史实际模型身份继续由原 Task 的未通过门禁维护；本结果不转为后续模型调用授权。

私有包：`.recovery-artifacts/t6-cancel-isolated-20261030T123230Z/`。关键文件为 `authorization-scope.json`、`isolated-command.json`、`isolated-command-result.json`、`isolated-cancel-http-postgres.json`、`isolated-postgres.log`、首轮 `.attempt-1` 文件、`cancel-fixture-typecheck.log`、`cancel-fixture-typecheck-fixed.log`、`write-scope-eslint-final.log`、`write-scope-format-final.log`、前后目标快照、`target-protection-proof.json`、三仓前后索引/HEAD、710 份源码摘要及 `acceptance-summary.json`。本证据保留必要结果，私有包不进入 Git。
