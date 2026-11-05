# AI 输出模式与 Provider 配置验收

2026-10-16～17，主仓 `main@da002744` 的现有未提交工作树；邻仓 DSA `dd265715`、infra `3f661df`。本记录证明消费者核对、受控 SDK、只读配置及禁用测试配置的保存，不宣称所有历史外部客户端兼容或真实生成成功。

## 消费者核对

全仓扫描 `native_schema | json_validated | json_mode`，按目录而非 `test` 子串排除测试，另核对共享类型和 Mobile/API client；主仓有 10 个直接生产消费者，全部使用现行三值 Schema、显式分支或共用显示映射。

| 所有者 | 现行处理 |
| --- | --- |
| `packages/schemas/src/ai-execution.ts` | `AiGenerationMode` 拥有三个枚举，客户端从共享类型消费 |
| Desktop Provider 的执行字段、配置转换及 `ai-output-mode-options.ts` | 自动/手动两级选择、三种中文标签、Anthropic 的 JSON Mode 禁用与原值回显 |
| Server 的 `ai-generation-output.ts`、SDK adapter、上游与验证策略 | 分别使用 `Output.object/json/text`，JSON Mode 仍经业务 Schema；协议限制与错误边界保留 |
| API client / Mobile | 没有另外维护双值穷尽映射或 Provider 编辑器；共享类型检查通过，不新增原生配置或编译义务 |
| DSA | 3 个命中的 screening 模块使用独立布尔 `llm_json_mode` 和 LiteLLM `json_object`，不消费主仓 `AiGenerationMode`；不迁移其原生分析链路 |
| infra | 没有输出模式枚举分派消费者，不新增并行协议 |

`packages/schemas` 的 `ai-execution.test.ts` 7 项通过；Server 的 `ai-json-mode.integration.test.ts`、`ai-generation-output.test.ts`、`ai-provider-upstream.test.ts`、`ai-sdk-generation-adapter.test.ts` 共 44 项通过。后者使用受控本机 HTTP/SDK，不计为真实模型样本。API client 与 Mobile typecheck 通过；Desktop 836 项/类型与构建复用同轮有效输入。

## 浏览器只读结果

- 编辑原 Provider：自动选择 → 手动指定后出现三种中文方式；JSON Mode 回显正确。390px 视口 Sheet client=scroll=373px，选择器 278px，无横向溢出。
- 草稿切为 Anthropic：原 JSON Mode 保留回显且选项禁用；切为 Responses 后 JSON Mode 可选，不自行换模式或请求上游。
- 类型 AI → 行情 → AI 保持同一 Drawer、名称和优先级。按现行 AC47 清理类型专属模型/用途，不能误判为需要恢复跨类型专属字段。
- 新建草稿从通知切到 AI：名称保留，默认 Chat Completions/通用兼容，base URL 和模型列表为空，没有预填供应商。
- 取消并确认丢弃本轮草稿，再打开原 Provider，仍是原 Chat 格式、原单模型、输入/输出零单价与自动选择；没有保存、改默认、获取目录或点击用途测试。

截图和请求摘要位于 `.recovery-artifacts/ai-output-mode-2026-10-16/`；上述配置交互期间 API 请求为 0，未变更执行开关或发起新生成。当前可关闭消费者核对和只读界面叶；用途生成、AC48 转换保存、目标运行态、真实费用与 Electron 保持原未通过状态。

## 10-17 请求账本核对与停止决定

用户先授权按原零费用和剩余次数恢复；执行前核对发现，过去反复引用的“6/10”只列了 09-20 的六次正式参数优化业务，没有纳入另一配置 Task 的连接和用途生成，不能继续解释为可用四次。

- [SDK 历史账本](../../archive/tasks/2026-09-19-vercel-ai-sdk-integration-history.md#g1-历史出站账本)列出六次业务请求，合法完整结果为 0，并在连续三次限流后停止。
- [配置 Task 原 T3.2](../../archive/tasks/2026-09-21-ai-provider-model-usage-configuration-history.md)记录 09-23 一次已保存连接生成及 research、parameter_optimization、strategy_discovery 三次用途生成；四条不同用途/耗时可区分，已有四次足以使六次以外的旧剩余额度失效。09-22 还记录多次成功与超时生成，但没有完整 request ID，不能伪造精确去重后的总数。
- 目标库只读核对当前 `AiRun` 为 0；这不抹去历史出站事实，也不重置预算。公开能力接口的 `canStart: true`、已保存 LMStudio 默认和零单价只证明当前配置就绪，读取这些接口不发生成。
- **用户明确决定：历史连接与用途生成全部计入原上限，本轮停止真实生成。** 因而原十次上限已无可用剩余额度。本次核对及恢复尝试新增真实生成 **0 次**，没有连接探针、用途测试、fallback 或新业务任务，也没有修改默认、开关或原未知结果。

G1 三类完整合法业务结果、研究真实任务、策略探索及真实费用门禁继续未通过。接续须有新的明确用户范围决定，不能复用“剩余四次”、另起账本或借截图/配置保存隐式生成。

## 10-17 禁用配置保存与安装态

新增专用 `ac48-acceptance-20261017`，Provider 和研究用途均保持禁用；地址为本机不提供服务的端口 9，无认证、无 Key、无价格、无默认引用。创建与 AI 保存前均核对 `validation-plan.maxCalls=0`、没有待验证路由，只调用普通保存接口，不调用 `test-and-save`。

- Web AI→行情的报价能力保存成功；受控 409 保留同一草稿，恢复后重试成功。行情→AI 曾发生真实版本冲突：Server 普通摘要已有 `updatedAt`，Desktop `providerDraftFromRecord` 与 `providerDraftForType` 丢失了它。补齐版本传递后，实际请求携带 `expectedRevision`，零调用计划与普通保存成功；保留服务端原子版本校验。
- 保存后的 Provider 与研究用途仍为 `enabled=false`，独立模式和 `90000/45000` 毫秒覆盖值保留。停用、重新展开用途不丢参数；界面单位为秒，实际显示 90/45。
- 部署来源配置切为行情且不提供接管凭证时，客户端明确阻断，观察段没有保存 POST；取消后原环境配置未变。此项只证明缺凭证拒绝，不代表正向接管或凭证保留验收已通过。
- 六个用途原先因共同 Field 覆盖成相同可访问名称，并重复隐藏输入 ID。改用已有 FieldSet/FieldLegend 与每项独立名称，一项真实挂载回归先失败后通过；版本传递三项回归也先失败后通过，相关三文件 41 项定向测试通过。
- 最新 macOS 安装包逐一回显六个用途名称，临时展开研究用途读到 90/45 秒，恢复停用并取消查看草稿。另将同一专用禁用配置优先级 999→998→999，两次父表单普通保存均成功，参数和停用状态保留。随后补齐下述安装态双向普通保存及真实版本冲突恢复；认证、混合旧配置、费用与真实业务仍未通过。

再次核对原 Provider 行及默认设置摘要完全一致，`AiRun`/`AiInvocation` 数量未变。只保留本轮新增的禁用验收配置；真实生成仍为 **0 次**。本地回执、受控错误/真实版本冲突及成功截图见 `.recovery-artifacts/ai-output-mode-2026-10-16/disabled-conversion*.json`、`conversion-saved-disabled.png`、`environment-takeover-guard.png`、`disabled-purpose-packaged.png` 和 `disabled-save-packaged.png`。

### 安装态双向普通保存与真实冲突恢复

10-17 在同一 macOS 安装包、端口 `62112` 中，通过统一编辑器将专用配置从 AI 转为行情并普通保存，再转回 AI 并普通保存，两次均显示“配置已保存”。名称、禁用状态和优先级 `999` 保留；类型专属模型、地址和认证按 AC47 清理后，在 AI 目标草稿显式重填原本机端口 9、`authMode=none`、`acceptance-disabled` 及研究用途的 90/45 秒覆盖。六个用途保存前均为停用，不点击获取模型、测试、启用或测试后保存。此结果不宣称跨类型保留专属配置。

再次打开安装版旧版本草稿，使用专用零调用入口只将同一配置的优先级更新到 `998`。写入前 `validation-plan.maxCalls=0`，提交携带当前 `expectedRevision`；未接触其他 Provider。安装版继续保存旧版本时实际收到 HTTP 409，显示“配置版本已变化”，名称和优先级 `999` 草稿保留。取消后列表读取到 `998`；重新打开最新版本，普通保存恢复 `999` 成功。

验收后 API 核对 Provider 与研究用途仍停用，覆盖值为 `90000/45000` 毫秒；原 Provider、研究默认配置及 `AiRun`/`AiInvocation` 与保护基线一致。新增真实生成、连接探针和用途测试均为 **0**。截图 `native-roundtrip-saved.png`、`native-version-conflict.png`，零调用竞争回执 `native-priority-998.json` 保留在上述本地证据目录。当前可关闭禁用配置在安装态的双向普通保存与冲突恢复叶项；实际凭证保留、环境正向接管、混合旧配置及真实业务/费用条件继续开放。
