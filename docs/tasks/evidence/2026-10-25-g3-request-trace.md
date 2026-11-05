# G3-D27：请求链输入输出 trace

## 本轮结果

已在正式 Server 代码接入按请求选择的 trace，并通过受控 HTTP、实际 SDK 和内存业务状态验证。链路为：业务执行输入 → SDK 输入／Schema → 最终 HTTP 请求 → 上游响应 → SDK 输出／异常链 → 业务结果构建／结算 → 实际业务状态反读。

本轮未部署、未调用真实模型、未改目标配置或业务数据，V2 关闭边界和剩余7次冻结保持。未暂存／提交，现有 WIP 保留。D25 历史原文没有因本次实现而恢复，G3 的真实生成和根因验收仍未完成。

## 接入方式与边界

- 研究创建显式携带 `X-Thesis-AI-Trace: capture-v1` 时，服务端生成引用；原身份、范围和 V2 写入门禁继续生效。仅新任务的 `modelMetadata.diagnosticTrace` 保存版本和 traceId，新建响应头返回 `X-Thesis-AI-Trace-Id`。复用旧提交不会产生未保存的新引用；通用 AI 创建入口禁止客户端注入 `diagnosticTrace`。
- `AiResearchExecutor` 在领取后按 run／owner／attempt 建立 trace；同一 attempt 不覆盖已有目录。默认关闭时不创建文件，也不增加最终状态查询。
- SDK 仍负责原请求序列化和响应解析。其 fetch 边界通过原生或受控 HTTP adapter 派发，每个 SDK requestId 最多调用一次 transport；同一响应的状态、headers 和 body 字节继续交给 SDK。取消／SDK 结束时关闭未消费流，不让取证副本继续消耗上游生成。
- 保存私有业务材料、Prompt、请求体、模型正文、SDK 输出或错误、业务结果和结算事实；凭据、认证头、Cookie、嵌套错误 JSON 中的凭据及 Provider 推理原文脱敏。共享日志只有 traceId／runId／attempt／状态／调用计数；业务表只保存轻量引用，既有共享有界诊断合同不扩容。
- HTTP wire 记录实际字节数／SHA256；落盘为脱敏后的 JSON／SSE payload 与独立 `assistant-content.txt`。保留原始模型正文的来源和原摘要，不将格式化／脱敏副本称为逐字节 wire 归档。SDK 异常链与 `independent_check_after_sdk_error` 事后校验分开，后者不是上游错误。
- 发送前 trace 不可用会以本地配置／取证错误阻止模型派发；发送后保存失败只标记 `incomplete`，保持原 SDK／业务结果。未到达节点标记 `skipped`；CAS false、取消和未观测终态保留实际值。节点状态表示操作是否完成，业务结果以根输出／`business.final_state` 和 manifest 业务状态为准。

私有根默认为 `${BACKTEST_SNAPSHOT_ROOT || cwd/var/backtest}/ai-traces`，与现有持久化根共用物理挂载，不依赖 backtest feature。目录0700、文件0600；响应内存副本和单 artifact 各2 MiB，单 trace artifact 合计8 MiB，manifest 128 KiB／64节点。响应截断、不可解析、取消和保存失败明确标记；未结束的 manifest 反读显示 `incomplete` 并保留 `running` 事实，不回写文件，不据此推断进程是否存活。

## 可查看的离线样例

以下均是公开固定材料和回环 HTTP 生成的受控样例，不能回填 D25。私有文件仅在本机保存，未进入Git。

- [样例索引](../../../.recovery-artifacts/g3-d27-20261025/offline-example.json)
- [完整节点 manifest](../../../.recovery-artifacts/g3-d27-20261025/trace-files/5ed65687-f63f-470c-bd54-2f3edbb3803d/ecbd378a-55ce-443b-9377-46ca03819b55/attempt-1/trace.json)
- [SDK 校验前的上游模型正文](../../../.recovery-artifacts/g3-d27-20261025/trace-files/5ed65687-f63f-470c-bd54-2f3edbb3803d/ecbd378a-55ce-443b-9377-46ca03819b55/attempt-1/ed02e7c3-95e6-48a9-8b11-a51e3e62cad5-assistant-content.txt)
- [SDK 输出／异常链及独立字段校验](../../../.recovery-artifacts/g3-d27-20261025/trace-files/5ed65687-f63f-470c-bd54-2f3edbb3803d/ecbd378a-55ce-443b-9377-46ca03819b55/attempt-1/1a628a6a-de48-4291-af73-0aaf5080842d-output.json)
- [业务最终状态](../../../.recovery-artifacts/g3-d27-20261025/trace-files/5ed65687-f63f-470c-bd54-2f3edbb3803d/ecbd378a-55ce-443b-9377-46ca03819b55/attempt-1/bc4cf2e1-ffa5-4ae9-a72c-035e7af8f2ae-output.json)

样例正文：

```json
{"answer":"这是离线受控上游正文；结构与研究 V2 合同不一致。"}
```

该样例 HTTP200／完整 SSE／stop，物理回环请求与 transport 各1次、真实模型0次；上游正文可独立反读，且与异常中的 `sdkOutputText` 逐字节相等、SHA256一致。SDK 失败链为 `AiSdkGenerationError → AI_NoObjectGeneratedError → AI_TypeValidationError → ZodError`。事后完整 V2 Schema 检查记录12项问题，业务最终 `failed / research_schema_invalid / result=null`，trace 捕获完整。字段问题只属于此固定样例，不能推断 D25 缺失了哪些字段。

| 核对项 | 实际值 |
| --- | --- |
| traceId | `5ed65687-f63f-470c-bd54-2f3edbb3803d` |
| 内存 runId | `ecbd378a-55ce-443b-9377-46ca03819b55` |
| 请求字节／SHA256 | 11004／`ab07f0d3e5f12cee291effdaed302cf4b33260a000e5f3785cad805d4d246914` |
| 响应 wire 字节／SHA256 | 861／`7ad00df53a7f8195f099b4ea41c6d0210ca627da5262f8edc2dd9da0c779639b` |
| 原模型正文 SHA256 | `141209201d7a746eefc243c985a87482fab73c0c3297044181e28fa5359bcd90` |
| 私有 artifact | 17个，全部0600；attempt目录0700 |
| manifest SHA256 | `de7191404856878ef803ce4df7b6289da1760986db9ab49537b378d88a5f0f0e` |

## 只读查看与导出

从仓库根执行编译后的本地查看器；它不连接数据库、Provider 或模型。根目录只供有私有文件权限的操作人指定，owner／run／attempt用于一致性核对，不提供公开文件读取接口。

```sh
node apps/server/dist/src/ai/trace/ai-trace-read.cli.js \
  --root .recovery-artifacts/g3-d27-20261025/trace-files \
  --trace 5ed65687-f63f-470c-bd54-2f3edbb3803d \
  --run ecbd378a-55ce-443b-9377-46ca03819b55 \
  --owner bd970cd1-ac29-45be-a18f-79f771754adc --attempt 1
```

加 `--node 1a628a6a-de48-4291-af73-0aaf5080842d` 可只导出 SDK 节点及其输入／输出。查看器检查引用、身份、路径、symlink 越界、大小和 SHA256。上述 CLI 已实际反读成功，未创建新 trace；反读后manifest摘要保持。

## 验证与剩余门禁

| 范围 | 结果 |
| --- | --- |
| 新 trace 三个测试文件 | 33项通过；包含默认关闭、创建引用／复用／V2门禁、并发隔离、原字节不变、HTTP502／SSE错误、完整V2 Schema失败、业务失败、断连／取消、前后保存故障、旧attempt拒绝、权限／路径／篡改／未结束反读 |
| 最终定向回归 | 10文件／110项通过 |
| Server 包测试 | 419文件／3437项通过，68文件／356项按原条件跳过，107.91秒；去除继承的凭据、数据库和外部验收开关。此后新增“未结束反读”一项，以上最终定向结果覆盖该增量 |
| Server 类型／构建 | `tsc -p apps/server/tsconfig.json --noEmit` 与 `pnpm --filter @thesis-ledger/server build` 通过 |
| 修改范围 lint | 28个代码／测试文件，0错误／0警告 |
| Server 相同 guardrails 规则 | 1237文件，0错误；179项警告保留，未调整阈值／ignore |
| 全仓边界／依赖 | `check-boundaries.mjs` 通过；依赖图8包通过 |
| 密钥／文件尺寸／空白 | 密钥扫描16843文件通过；文件尺寸ratchet通过，保留10项已有警告；`git diff --check` 通过 |
| 全仓复杂度门禁 | `lint-workspace.mjs --guardrails` 退出1；单独对 `apps/mobile` 复核596文件，297条错误全部位于release验收包的源码快照，均不在项目tsconfig内；其他文件0错误。全仓未通过 |

阻断路径示例为 `apps/mobile/release/acceptance-batch3-2026-10-24/精简验收包-收口/已验源码/apps/desktop/src/features/ai/ai.api.ts`，错误是 `was not found by the project service`。这些release文件的Git跟踪数为0，不能将其当作本次trace源码错误，也不能据非release文件无错误宣称全仓通过。日志另外出现React Native `index.js` 解析诊断；实际退出对应的297条fatal全部来自上述快照。保留现有验收包和WIP，未改变ignore／project service许可／复杂度阈值。解除条件是先按验收产物的实际所有权处理其与源码门禁的范围冲突，再重新通过全仓检查；本轮未处理该范围冲突，D27d保持未勾选。

验证主要输入为 `apps/server/src/ai/trace/**`、SDK generation transport／adapter、研究提交／执行／结算接线、对应测试和 `scripts/check-boundaries.mjs`。包级测试与内存 StateStore 验证不能代收目标 PostgreSQL 并发、Server／Worker DI 启动、真实私有卷／重建反读或 OpenRouter 采样。

部署与真实采样分别保留未验：先取得部署授权后通过 infra 最小正式入口更新，并核对两面模块、实际 Schema、挂载与权限；部署本身不解除7次冻结。真实模型仍需独立单次授权，原失败、旧数据、来源／路由及配置保护继续有效。
