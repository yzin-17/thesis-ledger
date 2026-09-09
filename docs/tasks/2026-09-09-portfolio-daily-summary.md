# 投资组合每日摘要实施任务

对应 Spec：[`../specs/2026-09-09-portfolio-daily-summary.md`](../specs/2026-09-09-portfolio-daily-summary.md)

## 任务

- [x] T1：交付每日持仓变化的端到端数据契约
  - 覆盖验收标准：AC1、AC4、AC5
  - 依赖：无
  - 涉及范围：Portfolio Service 估值、Portfolio API Schema、API Client 类型、Desktop Portfolio 适配层，以及对应 Server、Schema 和适配层测试。
  - 完成条件：股票、ETF 和场外基金按 Spec 口径提供持仓级每日变化；组合在基准币种中完整汇总；缺少昨收、行情或 FX 时返回明确的部分可用状态；旧响应仍可被 Desktop 安全读取。
  - 验证方式：Server Portfolio 定向测试、Schemas API contract 测试、Desktop Portfolio API 映射测试、相关类型检查。

- [x] T2：重构投资组合首页信息层级
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：T1
  - 涉及范围：Desktop `PortfolioDashboard`、组合表格 UI contract 和现有原子类组合。
  - 完成条件：首屏四项指标与持仓表按 Spec 展示每日变化、累计收益和仓位信息；空值、部分行情、实际/模拟模式与刷新行为保持正确；不复制收益分析页的完整能力。
  - 验证方式：Desktop 定向组件测试、类型检查、构建和可见文案审计。

- [ ] T3：完成本地页面视觉与交互验收
  - 覆盖验收标准：AC6
  - 依赖：T2
  - 涉及范围：真实本地 Desktop 页面宽屏、窄屏、浅色、深色，以及刷新和行情详情入口。
  - 完成条件：首屏层级清晰；窄屏表格可读且可横向访问；双主题对比度与正负值语义一致；控制台无本次修改引入的错误。
  - 验证方式：浏览器 DOM、截图、交互和控制台检查。
  - 当前证据：真实本地数据下已完成 1280×720 宽屏、浅色与深色主题检查；“行情详情”可打开；浏览器控制台无 warning/error。内置浏览器在设置 768×900 后页面 `innerWidth` 仍固定为 1280，未形成独立窄屏尺寸证据，因此本任务暂不勾选。

- [ ] T4：重构持仓行情详情的信息密度与图表表达
  - 覆盖验收标准：AC7、AC8、AC9
  - 依赖：T2
  - 涉及范围：Desktop `MarketDetailDialog`、行情详情区块、复用的图表原语及对应组件测试。
  - 完成条件：详情使用固定标题区和标准关闭按钮；最近日线与技术指标以可访问图表展示；加载、空态和 Provider 来源语义保持不变；正文使用单一滚动容器且整体间距收紧。
  - 验证方式：Desktop 定向组件测试、类型检查、构建、受影响文件静态检查，以及本地页面宽屏、窄屏、浅色、深色与关闭交互检查。
  - 当前证据：实现已完成。Desktop 行情详情 3 项测试通过，Desktop typecheck/build、定向 ESLint、依赖边界和文件尺寸 ratchet 通过；真实 1280×720 页面已确认摘要可见、最近日线折线与日内高低范围可见、MA/MACD/RSI 数据条可见、浅色与深色主题正常，标准关闭按钮固定在弹窗头部。内置浏览器无法切换真实 CSS 窄屏视口，因此 AC9 的窄屏证据仍待补，本任务暂不勾选。

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现；AC1 至 AC5、AC7、AC8 已完成，AC6 与 AC9 的窄屏证据待补
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；窄屏视觉证据待补，本次未获提交授权，工作保持未提交
- [x] 未发现实现、Spec 与任务文档之间的不一致；已明确记录验证边界

### Review 结论

- 结论：数据契约、首页摘要与行情详情实现通过定向 Review；T3、T4 因宿主浏览器无法形成独立窄屏视口证据，暂不标记全部完成。
- 发现的问题：无 Blocking 问题。
- 遗留风险：当前“今日持仓收益”是当前持仓昨收法估算，不包含日内成交与现金流归因；该口径已在界面直接说明。窄屏依赖现有表格横向滚动契约，仍需在可控制真实 CSS 视口的浏览器中补一次视觉复核。
- 验证命令与结果：
  - `pnpm --filter @thesis-ledger/server exec vitest run test/portfolio/services.test.ts`：11 项通过。
  - `pnpm --filter @thesis-ledger/schemas exec vitest run test/api-contracts.test.ts`：6 项通过。
  - `pnpm --filter @thesis-ledger/desktop exec vitest run test/portfolio-table.test.tsx`：2 项通过。
  - Server 与 Schemas `typecheck`：通过；Desktop `build`：通过，保留既有大 chunk warning。
  - 变更文件定向 ESLint、复杂度与函数行数门禁：通过。
  - `node scripts/check-file-size-guardrails.mjs`：ratchet 通过，报告 10 个与本次改动无关的存量 warning。
  - 本地页面：宽屏浅色、宽屏深色、真实组合数据与“行情详情”交互通过；控制台无 warning/error；窄屏受上述宿主视口限制未完成。
  - 行情详情补充验证：Desktop 行情详情 3 项测试通过；真实数据下日线折线、高低范围、三组技术指标数据条、固定关闭按钮与双主题通过；窄屏视口证据待补。
