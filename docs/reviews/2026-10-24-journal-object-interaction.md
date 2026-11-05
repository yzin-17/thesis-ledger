# 单笔复盘对象交互复核

## 结论与范围

2026-10-24，按用户确认的“对象选择、详情展开和操作按钮的位置”完成[规格](../specs/2026-10-24-journal-object-interaction.md) AC01—AC05。选中行及按钮明确反馈当前对象，选择后定位当前复盘区，返回列表保留状态，再点“已选择”可回到详情。操作位于对象标题区，关键事实常驻，成交与计划来源、原始证据数据独立展开。时间筛选常驻。

本轮没有调整证据资格、状态映射、分析请求、保存条件或 AI 调用策略。保留既有草稿 Sheet 与关闭确认。页面展示调整复用现有原子类及组件，没有新增样式选择器。

## 自动验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/journal-object-interaction.ui.test.tsx test/journal-candidates-interaction.ui.test.tsx test/journal-period-interaction.ui.test.tsx test/journal-snapshot-interaction.ui.test.tsx`：4 个文件、32 项通过。
- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- 针对本轮产品文件及测试的 `git diff --check`：通过。
- taste-skill `lint.mjs --app` 检查四个产品文件：0 FAIL、5 WARN。3 条为业务模式值 `shadow` 的误报；2 条为原有数量和收益数字的等宽字体。本轮未新增这些模式。

新增用例覆盖选中反馈、选择后的焦点、返回后的焦点、再次定位、操作所在区域、来源默认收起与展开，以及返回后保留结果且不触发保存。已有草稿取消、应用、分析失败保留旧结果、快照失败重试和过期结果限制继续通过。

## 浏览器复核

使用本地 Vite 的 `test/browser-journal-review.html?layout=1`，通过 CUA 实际操作。请求由既有验收页面模拟，没有访问业务服务或真实 AI。

| 验收项 | 实际结果 |
| --- | --- |
| 1440 / 768 / 390 宽度 | 页面无横向溢出；手机操作自动换行，候选表自身滚动 |
| 选择对象 | 行底色与“已选择”反馈准确，焦点进入当前复盘区 |
| 返回、再次点击已选择 | 焦点分别回到列表与复盘区 |
| 来源展开 | 可读取真实退出、入场与原计划来源 |
| 显式分析后返回并再次定位 | 分析结果和来源展开状态保留 |

截图：`/tmp/thesis-ledger-journal-layout/object-final-1440.png`、`object-final-768.png`、`object-final-390.png`。未运行独立的 taste-skill 浏览器脚本；视觉验收依据为 CUA 截图及实际操作。

## 验收边界

本次完成本地源码、定向测试与模拟数据浏览器验收。未同步 Docker 目标运行态，未验证 Electron 或真实业务数据环境，未提交、推送或部署。
