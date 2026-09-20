# 实时行情涨跌展示实施任务

对应 Spec：[实时行情涨跌展示 Spec](../specs/2026-09-18-market-quote-change-display.md)

> 状态：实现完成；Desktop 定向测试、typecheck、build 与 ESLint 通过

## 任务

- [x] T1：在 Desktop 实时行情卡片中接入涨跌方向色和涨跌幅展示。
  - 覆盖验收标准：AC1、AC2、AC3
  - 依赖：无；现有 `QuoteV1` 和 Desktop 涨跌语义色契约已就绪。
  - 涉及范围：`MarketDetailSections` 行情卡片及其定向测试；不修改 Server/API/Schema、数据获取、缓存和其他行情模块。
  - 完成条件：实时价和涨跌幅共享实际涨跌方向及全局配色；涨跌幅格式、无效前收占位、四列宽屏布局和既有状态提示均符合 Spec。
  - 验证方式：Desktop 行情详情定向测试，覆盖上涨、下跌、持平和无效前收；再执行受影响包 typecheck/build。
  - 验证证据：已新增 `market-quote-display.ts` 纯函数，接入 `MarketDetailSections` 的实时价/涨跌幅颜色和四列布局，并在 `MarketDetailDialog.test.tsx` 增加卡片字段与格式断言；`rtk pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail` 通过，18 个文件、71 个测试；`rtk pnpm --filter @thesis-ledger/desktop exec tsc -p tsconfig.json --noEmit` 通过；`rtk pnpm --filter @thesis-ledger/desktop build` 通过；定向 ESLint 通过；`rtk git diff --check` 通过。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 实时价与涨跌幅颜色方向及配色切换 | T1 | T1 定向组件测试 |
| AC2 / 涨跌幅公式、符号和格式 | T1 | T1 定向组件测试 |
| AC3 / 无效前收和既有状态语义 | T1 | T1 定向组件测试 |
| AC4 / 分层验证证据 | T1 | T1 定向测试、typecheck/build |

## 规划前置 Review

- 结论：可实施。
- Blocking：无。
- 范围边界：本次仅为 Desktop 展示层改动，不扩展 API、服务端或运行时部署验收。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] T1 满足完成条件且验证证据仍有效
- [x] 代码未超出展示层范围，未覆盖既有用户修改
- [x] 测试、Task 状态与实际实现一致
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：通过；本地 Desktop 展示层验收完成。
- 已确认的问题及责任任务：无。
- 尚未通过的必要门禁与阻塞原因：无。本次不涉及 API、Server、Docker、Provider 或数据库，因此没有新增更高层运行态门禁。
- 遗留风险或已确认的后续范围：无。
- 验证命令/过程、结果与证据引用：`market-detail` 定向测试 18 个文件、71 个测试通过；Desktop typecheck、build、定向 ESLint 和 `git diff --check` 通过。新增纯函数和文档通过定向 Prettier 检查；两个已有大文件的整文件 Prettier 检查仍受本次之前工作区未格式化改动影响，未执行整文件格式化以避免覆盖用户修改。
