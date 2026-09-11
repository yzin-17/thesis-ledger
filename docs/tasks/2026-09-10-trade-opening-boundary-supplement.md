# 历史建仓时间补录实施任务

对应 Spec：[`../specs/2026-09-10-trade-opening-boundary-supplement.md`](../specs/2026-09-10-trade-opening-boundary-supplement.md)

> 任务标识：`2026-09-10-trade-opening-boundary-supplement`  
> 状态：代码实现完成，2/2 完成  
> 当前阶段：确定性验证完成；真实 Server、浏览器和 Docker 运行时验收待执行

## 执行约束

- 只实现精确到分钟的 Baseline-only Trade 建仓时间补录，不扩展到其他缺失属性。
- LedgerEvent 是唯一事实源；不得直接更新 Trade、Position 或 Cash 物化结果。
- 用户补录必须与真实 BUY/SELL 成交区分，并通过 `OPENING_BOUNDARY_ASSERTION` 证据来源展示。
- 保留当前工作树中的统一回测和其他无关改动，不清理、提交或回退它们。
- Desktop 请求使用 TanStack Query；表单复用现有 Sheet、Field、DateInput 和原子类。

## 任务

- [x] T1：完成建仓时间补录的账本、投影、API 和 Desktop 最小闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC5
  - 依赖：无
  - 涉及范围：`packages/schemas`、`packages/domain`、Ledger/Trade server、`packages/api-client`、Portfolio Trade Desktop 详情和审计文案。
  - 完成条件：
    - 新增 `TRADE_OPENING_BOUNDARY_ASSERTION` 事件和精确时间命令契约。
    - 新事件不改变 Position/Cash，且 Baseline-only Trade 投影能应用用户断言并保留 `PARTIAL`。
    - 服务端校验账户、Trade、Baseline fact、Entry Leg、时间顺序和重复提交；写入后重建投影。
    - Trade 详情提供条件化补录入口、必填时间和补录依据，成功后刷新列表和详情。
    - 新事件在账户数据事件列表、审计读取和 Trade evidence source 中有中文展示。
  - 验证方式：
    - Schema/domain/server/Desktop/API client 定向测试。
    - 受影响包 typecheck 和 build。
    - Prettier、边界门禁和 `git diff --check`。
  - 验证证据：新增账本事件、投影处理、Server 命令服务、Trade API、API client 和 Desktop Sheet 已实现；Schema/Domain/API client 定向测试 4 个文件 80 项通过，Server 建仓时间服务与 HTTP 校验测试 15 项通过，Desktop Trade UI 测试 4 项通过；补录事件不会进入 Position/Cash 投影，Server 核心投影回归 16 项通过；相关包 typecheck/build、定向 ESLint、边界门禁和 `git diff --check` 通过。

- [x] T2：完成定向回归、文档证据和最终一致性 Review
  - 覆盖验收标准：AC1–AC6
  - 依赖：T1
  - 涉及范围：本 Spec、本任务文档、`docs/README.md` 导航、受影响测试与本地运行结果记录。
  - 完成条件：
    - 所有 AC 均映射到已验证实现，旧 Trade 和无补录数据行为保持不变。
    - Spec、Task、Schema、Server、Domain、API client 和 Desktop 的事件名、字段名及语义一致。
    - 已记录确定性验证结果；真实 Docker/浏览器验收若未执行，明确保留为遗留风险。
    - 任务状态和最终一致性 Review 清单与实际证据同步。
  - 验证方式：
    - 复核 AC→代码→测试映射。
    - 运行受影响包测试、typecheck/build、Prettier、边界检查和 `git diff --check`。
  - 验证证据：已同步 Spec、Task、README、CONTEXT、Schema、Domain、Server、API client、Desktop 和测试中的事件名及语义；新增事件通过现金投影兼容回归。受影响文件的 Prettier 检查除两个既有无关排版差异外均通过；`apps/desktop/src/features/account-data/account-data.helpers.ts` 的旧表单折行和 `packages/api-client/src/index.ts` 的旧回测接口折行保持原状，未覆盖工作树中的其他改动。未执行真实 Server、浏览器或 Docker 验收，保留为运行时遗留风险。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，保持未提交并记录状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：代码实现和确定性分层验证完成；任务范围内无 Blocking 问题。
- 发现的问题：现金投影最初未识别新事件，已补充为可读取但不产生现金操作，并由核心投影回归覆盖。
- 遗留风险：尚未启动真实 Server、浏览器和 Docker 环境；当前旧运行时可能未包含新增 API、Schema 和 Desktop 代码，需要重启/重建后验收。完整 Prettier 检查仍受两个既有无关排版差异影响。
- 验证命令与结果：Schema、Domain、API client、Server、Desktop 定向测试通过；受影响包 typecheck/build 通过；定向 ESLint、`rtk node scripts/check-boundaries.mjs` 和 `rtk git diff --check` 通过。
