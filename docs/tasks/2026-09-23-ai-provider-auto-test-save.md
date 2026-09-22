# AI 接入自动选择与测试后保存实施任务

- Spec：[AI 接入自动选择与测试后保存](../specs/2026-09-23-ai-provider-auto-test-save.md)
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
- [ ] T6 全仓 CI、浏览器交互、真实 PostgreSQL 并发与目标运行态/真实 Provider 验收。

## 本地证据

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

## 证据限制

服务测试使用受控存储替身；HTTP/SSE 测试使用真实锁定 SDK 和本地真实 HTTP 服务，不访问真实模型。尚无真实 PostgreSQL 竞争、Docker、浏览器或真实供应商可用性证据。不能据此将 T6 勾选。

为解决容器不能直连 GitHub/npm 的限制，曾在实施分支使用临时 source/dependency workflow 取得 git 跟踪源码及锁定依赖（不归档 .git、环境变量或密钥）；临时工作流与提交传输文件在最终代码提交中移除。正式 CI 不因本 PR 被禁用或放宽。
