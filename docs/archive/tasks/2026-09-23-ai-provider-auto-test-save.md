# AI 接入自动选择与测试后保存实施任务（历史记录）

> 历史记录（2026-10-15 归档）：保留原步骤、编号、完成条件、当时状态和证据。尚未通过的条件已由[当前 Task](../../tasks/2026-09-21-ai-provider-model-usage-configuration.md#verified-save-acceptance)承接；不再从本文启动实施，归档不表示验收完成。


> 状态对账（更新于 2026-10-04）：已实现待验收：verified-save、onboarding HTTP 和 Desktop 历史局部门禁保留，#45 已在本地提交历史合入。本轮 T6.P1 的真实 PostgreSQL 保存竞争 5 项通过，默认引用另由用途配置 T4.2.P1 验证；T6 仍缺完整当前 CI、真实 Provider、浏览器与修订后超时/取消及目标运行态。初始对账见[Review](../reviews/2026-10-03-task-state-reconciliation.md)，本轮证据见[保存与默认引用竞争](../../tasks/evidence/2026-10-04-ai-provider-postgres-concurrency.md)。

- Spec：[AI 接入自动选择与测试后保存](../../specs/2026-09-23-ai-provider-auto-test-save.md)
- 基线：main@f74a18e7dc8711aab7833461c2b4adeb4bb04fbe（#44 已合入）
- PR：#45，`codex/ai-provider-auto-test-save`
- 状态：本地实现及定向验证完成；全仓 CI 与目标运行态门禁待验证。

## 实施

- [x] T0 核对主分支、已有 PR 和当前编辑器/生成链路。
- [x] T1 定义 auto/manual 策略、用途验证记录、指纹及保存门禁；实际 mode 不增加 auto。
- [x] T2 按用途受控验证、费用确认、调用意图和结果审计、重复操作 ID 拦截与旧配置 CAS 保存。
- [x] T3 默认自动/手动展开界面、测试并保存、取消入口和失败草稿保留；用途继承/高级超时折叠。
- [x] T4 新增策略/保存/取消/授权回归 19 项、真实 SDK HTTP/SSE 编排回归 4 项、Desktop 序列化/文案/确认流程回归 7 项。
- [x] T5 定向测试、类型检查与应用构建；导入边界和文件尺寸 ratchet。
- [ ] T6 全仓 CI、浏览器交互、真实 PostgreSQL 并发与目标运行态/真实 Provider 验收；按 2026-09-24 修订的 Spec 验收第 9 项，分别验证非流式总超时、流式首输出 / 输出间隔、300 秒操作期限和取消归因。

## 本地证据

### T6.L1：修订后超时与取消生命周期（2026-10-04）

- [x] 按原 Spec 验收 6/9 验证非流式总超时、持续 SSE 超过 Provider timeout、首输出停顿、输出间隔停顿、300 秒操作期限与用户取消（本机真实 HTTP/SSE、加速操作信号；目标入口恢复复验通过，真实供应商门禁另保留）。
- 输入：当前锁定 SDK、连接探针、验证 runner 和保存服务；复用已有 T6.P1 保存竞争证据，不重新执行未改变的数据库输入。
- 写集：用途验证的中止归因与 HTTP/SSE 回归，发现缺陷时仅修复该领域边界；不改正式研究/优化预算或重试，不访问收费模型、不写目标 Provider 草稿。
- 执行拆分：先本机真实 HTTP/SSE 证明传输和归因，再类型/包级与仓库门禁，随后官方入口更新目标并核对接口。真实供应商/浏览器费用确认仍属于独立门禁。
- 已修复操作总期限被解释成用户取消的归因缺陷，保留两类事实及已知用量；32 项生命周期/保存/HTTP 回归通过。官方完整更新后目标空默认拒绝连续 3 次未退出进程；详见 [生命周期及目标证据](../../tasks/evidence/2026-10-04-ai-lifecycle-and-submission.md)。完整 T6 的真实 Provider、费用与客户端门禁继续开放。

### T6.P1：真实 PostgreSQL 保存竞争（2026-10-03）

- [x] 验证同版本编辑、同名首次创建与同操作 UUID 重放只有一个写入/调用获准；验证测试成功后的 CAS 冲突保留原配置和审计，并可由新服务实例复用成功记录。
- 输入：当前 `AiProviderSaveService`、`ProviderConfigService`、验证日志及本 Spec 验收 2、4～6；依赖 T1～T5 的当前实现，不依赖新版超时或真实模型。
- 写入范围：AI PostgreSQL 集成测试及隔离运行入口；发现确切保存缺陷时只修改对应持久化边界。隔离数据库使用临时容器和 tmpfs，按全部当前 migration 初始化；禁止连接业务库、访问真实 Provider 或提交。
- 验证：先现有保存定向测试，再真实 PostgreSQL / 本机 HTTP 竞争；SDK 输出为受控样例，数据库、服务与 HTTP 为真实实现。应用门禁按实际源码变化升级验证，不把本叶结果视为完整 T6。
- 停止点：保存竞争叶交付后，默认引用竞争由用途配置 T4.2.P1 独立执行；真实模型/计费、浏览器、完整 CI、超时与目标部署保持原门禁。
- 规划预检：输入与验收契约就绪，可执行；完整上传设计稿当前不在 Downloads，本叶使用仓库 Spec 与已固化的原断言，不缩减验收。
- 完成检查：5 项真实 PostgreSQL/HTTP 用例通过；补上删除后旧草稿不能重建的保护。原 T6 不勾选，未触发真实模型、修改目标数据库或部署。详细命令与范围见[证据](../../tasks/evidence/2026-10-04-ai-provider-postgres-concurrency.md)。

环境：Node 22.16.0；项目锁定依赖由同仓临时只读 source/dependency artifact 获取，未升级 manifest 或 lockfile。CI/部署使用 Node24，需单独观察结果。

- `tsc -p packages/schemas/tsconfig.json`：通过。
- `tsc -p apps/server/tsconfig.json`：通过（包含原 #44 推导返回类型 TS2742 的显式接口修复）。
- `tsc -p apps/desktop/tsconfig.json --noEmit`：通过。
- Desktop `vite build`：通过，保留现有大型 bundle warning，未放宽门限。
- Server 定向 6 文件 112 项通过：verified-save、onboarding-http、provider-readiness、provider-management、json-mode、SDK-generation-adapter。
- Desktop 定向 3 文件 44 项通过：auto-save、provider-ui、provider-credentials。SSR 文案断言和请求模拟不是浏览器点击验收。
- 新增验证服务/runner/policy/journal 与测试 ESLint：通过。其他改动文件定向扫描发现的两处测试 unused 参数已修复，全仓扫描仍由 CI 复核。
- `check-boundaries.mjs`、`check-workspace-dependencies.mjs`：通过；增加 Provider storage 不反向依赖 AI、AI 不反向依赖策略编排的门禁。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`：ratchet 通过，14 项已有超限 warning；未上调阈值。

## 提交与远端核验

实际实现已提交为 `47a2b366f3d9b078e91960335a2d004dd09eb4ae`。与本次 main 基线比较为 ahead、behind 0，共 38 个业务源码/测试/文档文件变化。最终 diff 不含临时工作流或补丁传输文件，未改变正式 CI、依赖锁文件或数据库 migration。此前 docs-only 或补丁传输提交上的 CI 不构成实际实现验证，须以包含完整实现的后续提交 Checks 为准。

## 证据限制

2026-09-23 原实现证据：服务测试使用受控存储替身；HTTP/SSE 测试使用真实锁定 SDK 和本地真实 HTTP 服务，不访问真实模型。当时没有真实 PostgreSQL 竞争、Docker、浏览器或真实供应商可用性证据。2026-10-04 已补 T6.P1 的隔离 PostgreSQL/HTTP 保存竞争；目标 Docker、浏览器、真实 Provider 等仍开放，不能将 T6 勾选。

2026-09-24 超时契约修订后的测试与当前流式执行源码仍需重新对账；上面的原提交测试计数只证明其当时基线，不作为新增验收第 9 项的通过证据。

为解决容器不能直连 GitHub/npm 的限制，曾在实施分支使用临时 source/dependency workflow 取得 git 跟踪源码及锁定依赖（不归档 .git、环境变量或密钥）；临时工作流与提交传输文件在最终代码提交中移除。正式 CI 不因本 PR 被禁用或放宽。
