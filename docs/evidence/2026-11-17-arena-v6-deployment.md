# 无效卖单补丁部署与 v6 路由门禁核验

## 当前结果

对应 [Spec AC20](../specs/2026-11-12-arena-replay-live.md) 和活动 Task 的 R4D。无效卖单、可卖数量反馈及补充截断分类修复已部署到本地 Server／Worker，运行态验收通过。**v6 路由尚未保存或准入**：正式计划要求一次真实模型生成，本轮禁止调用模型，不能将固定响应或 v5 记录充当 v6 通过证明。

原模型、参数、所有配置和原业务记录保持，本轮真实模型调用、比赛创建／启动／恢复／重试均为零。新比赛仍暂停，Arena 研究队列保留本任务拥有的维护暂停，防止后台进入未准入版本。R4D3 及 R4 总体继续未完成。

## 部署与保护

应用目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，部署目录为同级 `thesis-ledger-infra`。按顺序执行：

```sh
node ../thesis-ledger-infra/scripts/infra.mjs locked -- node scripts/local-runtime/arena-maintenance-queue.mjs pause .recovery-artifacts/arena-v6-deployment-20261117/queue-owner.json
node ../thesis-ledger-infra/scripts/infra.mjs locked --idle -- node scripts/local-runtime/run-arena-v6-deployment.mjs capture .recovery-artifacts/arena-v6-deployment-20261117
```

两条命令退出 0，活动、等待、暂停作业数均为零。原队列未暂停且无其他归属，本任务登记独立归属。基线于 2026-11-17 01:43:03（Asia/Shanghai）固定，覆盖 23 张业务表及 AI 验证日志共 24 项保护摘要。ProviderConfig 的健康／检查时间等易变字段单独排除，模型、参数、费用、路由及凭证密文仍在配置摘要中；Arena 旧估值与之后的后台追加分别审计。

从 infra 目录执行正式最小目标：

```sh
./scripts/sync-code.sh thesis-ledger
```

首次部署退出 0。运行态固定响应发现截断分类缺口后补充源码与测试，再使用同一正式入口同步一次，最终退出 0。两次均由正式入口完成构建、兼容及运行门禁，未绕过入口手工替换文件。最终 Server、Worker、DSA 均健康，两个应用镜像均保持 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`；DSA 镜像未改。本次更新在容器可写层，没有数据库结构、镜像或外部卷变更，重建容器后需要正式重新同步或更新镜像。

## 运行态发现与补充修复

原生 Schema 的 SDK 可能先抛出 `NoObjectGeneratedError`，使同时违反 Schema 且以 `length` 结束的响应在原分类器中成为 `schema_invalid`。首次检查立即拒绝；补充私有诊断后确认同一原因，没有调用真实模型、保存配置或重试比赛。原失败日志保留在私有恢复目录。

补充修复由 AI 错误分类层保留 SDK 的真实终止原因：`length` 优先归类 `output_truncated`，拒绝及其他非正常终止也不伪装为 Schema 不匹配。诊断将终止原因交给 Arena，只有明确的正常 `stop`、完整 JSON、已知用量与身份核验通过的决策才能进入原一次修正路径。结束原因缺失、截断或非正常终止均不允许修正。

新增三种输出模式“无效 Schema 正文＋length”的固定响应测试，联合相关 8 文件 60 项通过；最终 Arena／AI 的 18 文件 160 项回归通过，Server 完整类型检查退出 0，最终正式构建通过。相关 TypeScript ESLint 无错误，维护脚本由 Node 语法检查和两项候选保护测试验证；三个 `.mjs` 在现有 ESLint 忽略范围内，未将其忽略警告当作已 lint。边界、依赖和尺寸门禁均退出 0。

## 目标容器核验

通过登记的持锁入口执行 `verify`：

```sh
node ../thesis-ledger-infra/scripts/infra.mjs locked --idle -- node scripts/local-runtime/run-arena-v6-deployment.mjs verify .recovery-artifacts/arena-v6-deployment-20261117
```

最终退出 0。Server、Worker 每个容器的 19 个实际核心产物分别与宿主构建摘要一致，涵盖生成合同、Domain 可卖数量、提交、研究调用／循环／提示／反馈、诊断和截断收敛。实际容器分别执行 6 个固定响应，最终共 12 个通过；全部拦截到内存响应，真实网络尝试和模型调用均为零。

运行态还通过实际 Domain 及研究器的内存替身核验：原失败正文仍拒绝、字段反馈保留、T+1 不可卖、到达可卖日的批次解锁、原账户不变、Schema 与业务拒绝共用一次额度，以及截断不再安排延迟研究。控制输入与内存账户不作为真实行情或真实成交证明。

## v6 路由与准入

候选从实际 LM Studio 配置生成，仅改变该模型 Arena 用途的合同 `arena-live-research-v5`→`arena-live-research-v6`。模型仍为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，原地址、采样／思考、输出模式、超时、限额、定价、其他用途路由及凭证保持。

`plan` 经实际 `POST /api/v1/ai/providers/validation-plan` 返回 201：

- 待验证用途只有 `arena_live_research`，策略为原 `manual`。
- `maxCalls=1`，没有可复用的精确 v6 通过记录。
- `applied=false`，真实模型调用为零。

维护入口首次使用缺少 `/v1` 的路径收到 404；按实际全局前缀修正后获得上述正式计划，未产生配置写入。

当前正式普通保存会拒绝任何未验证的启用用途，验证指纹包含完整合同版本；真正产生新证明的 `testAndSave` 会执行模型生成。因此本轮没有调用该入口，没有构造或转移 v5 指纹，也没有直接写表绕过保存边界。不能宣称 v6 路由升级或准入完成。后续只有在另行允许一次真实验证后，才可重新取得最新计划、核对参数、办理准入并读回；本轮没有请求或消费这次模型调用授权。

## 最终审计与留存

`audit` 正式入口退出 0：24 项原记录／配置／验证日志摘要保持，32 条自然后台估值追加独立记录，队列仍为本轮归属暂停。新比赛 `5a9817c2-e994-45af-896d-7e24bbc4633b` 在 01:51:26 只读确认仍暂停，原周期仍失败，模型调用仍为 9 次；原失败原文摘要仍为 `f1c614b25e08f4dd76b548e385aed997d0405cdfb0a44959ba88024ea5130128`。

私有回执目录为 `.recovery-artifacts/arena-v6-deployment-20261117`：

| 回执 | SHA-256 |
| --- | --- |
| `baseline.json` | `8f02bb2f13d8cf759058d809de9d1aa083765b32e9a7c9ba0d8c1eab925c72d6` |
| `route-plan.json` | `d67e66064a53b082f9fd32e19bbaf96f3c32365883c1ef0ebaa90ff236de3e3b` |
| `runtime-readback.json` | `680b9c868e7d84bd7a9a9b6ac0bfc2bd859edb698a0312d135e1f041e0db2e66` |
| `audit.json` | `fd9061a351431aad8a808c698b4284f890fa4132e7a61bd171b51a9b0ef409a1` |

队列归属回执单独保留，后续只能恢复本任务拥有的暂停。共享更新锁已随各正式命令正常释放。没有提交、暂存、回退或清理其他在途改动。

## 一致性审查

部署及目标运行态核验范围通过，真实失败和用户约束保持。v6 升级／准入因实际验证计划仍需一次真实生成而阻塞；用户明确禁止模型调用时，不能把这一门禁标为完成或降低标准。研究队列暂停、路由未保存和 R4 尚未追平均为当前事实，未移入 TODO 或归档制造完成。
