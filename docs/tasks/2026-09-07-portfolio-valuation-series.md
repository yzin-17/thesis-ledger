# 组合估值走势实施任务

对应 Spec：[`../specs/2026-09-07-portfolio-valuation-series.md`](../specs/2026-09-07-portfolio-valuation-series.md)

## 任务

- [x] T1：交付 DSA 基金披露持仓能力
  - 覆盖验收标准：AC1、AC2、AC9
  - 依赖：无
  - 涉及范围：DSA capability、Provider 适配、HTTP 契约、缓存、健康检查和真实样本。
  - 完成条件：`FUND_HOLDINGS` 返回稳定证据；权重保持实际披露比例；空值、重复证券和 Provider 失败具有稳定状态。
  - 验证方式：DSA 单元/契约测试、Provider smoke、至少一个真实基金样本及估算误差记录。

- [x] T2：持久化账户分钟估值并实现基金估算
  - 覆盖验收标准：AC2、AC3、AC8
  - 依赖：T1、Snapshot V2 T1
  - 涉及范围：AccountValuationPoint、估值服务、基金持仓证据、行情/NAV/FX、盘中采样 Handler。
  - 完成条件：采样幂等；基金估算不归一放大；缺失和陈旧证据返回覆盖率与稳定质量；不回填上线前分钟数据。
  - 验证方式：Prisma validate、估值单元/集成测试、采样 Runtime 测试。

- [x] T3：交付组合估值走势查询
  - 覆盖验收标准：AC3、AC4、AC5、AC8
  - 依赖：T2、Snapshot V2 T2
  - 涉及范围：`GET /performance/series`、账户/组合聚合、周期桶、区间矩阵、点数上限和数据质量。
  - 完成条件：参数和响应符合 Spec；日级去重；真实时间排序；所有区间与粒度组合有确定行为。
  - 验证方式：Server API/Service 测试、时区边界测试、2,000 点限制测试、Performance 回归。

- [ ] T4：交付 Desktop 周期控件和坐标 Tooltip
  - 覆盖验收标准：AC4、AC6、AC7、AC8
  - 依赖：T3
  - 涉及范围：TanStack Query、区间/粒度控件、SVG 时间坐标、十字光标、Tooltip、键盘与触屏交互。
  - 完成条件：不可用粒度禁用且自动回退；鼠标、键盘和触屏均能选择最近点；Tooltip 完整展示时间、金额、状态、覆盖率和质量。
  - 验证方式：Desktop 组件测试、类型检查、真实浏览器宽窄屏与交互验收。

- [ ] T5：完成跨仓库一致性 Review
  - 覆盖验收标准：AC1–AC9
  - 依赖：T1、T2、T3、T4
  - 涉及范围：DSA、Server、Desktop、Spec/Task、边界与外部证据。
  - 完成条件：全部 AC 有当前证据；无命名和口径漂移；外部 Provider 阻塞没有被误报为完成。
  - 验证方式：目标测试集、类型检查、边界检查、Prettier、`git diff --check` 和浏览器验收。

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现
- [ ] 所有已勾选任务均有验证证据
- [ ] 所有任务依赖均已满足且无错误阻塞关系
- [ ] 跨任务接口、类型和命名保持一致
- [ ] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [ ] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [ ] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：DSA、账户估值点、组合走势 API 与 Desktop 交互实现已落地；T4/T5 保持未勾选，等待新 Server 配合 fresh baseline 完成有数据浏览器验收。
- 发现的问题：当前运行中的 Server 未加载本次 `GET /performance/series` 与三个系统任务，浏览器请求返回旧版 `404`；为避免破坏现有数据库，本次未执行 fresh-baseline 重建。
- 遗留风险：浏览器已确认区间/粒度控件存在、手动快照入口消失、自动化页签可进入，但尚未在真实点位上完成鼠标、键盘、触屏十字光标验收，也未在运行态看到三个新系统任务。
- 验证命令与结果：Server `397` 项、Desktop `161` 项、Schemas `103` 项、DSA `28` 项测试通过；真实基金 `000001.OF` 样本披露覆盖率 `79.96%`、可定价覆盖率 `43.72%`、估算 NAV `1.251592`、正式 NAV `1.239`、绝对百分比误差 `1.0163%`；类型检查、目标文件 ESLint、边界、尺寸 ratchet 与两仓库 `git diff --check` 通过。
