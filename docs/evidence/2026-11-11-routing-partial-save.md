# 推荐主备保存与待选入口验收

## 范围与结果

用户确认允许保存已确定建议，待选择项保留原配置。对应[需求 AC3](../specs/2026-11-10-routing-recommendation-and-intraday-probe.md)和[任务 T9](../tasks/2026-11-10-routing-recommendation-and-intraday-probe.md)。

主页面与细分配置共用的保存条件不再要求待选数为零；草稿修改、目录完整性和请求进行中的原有条件继续生效。推荐算法和同等候选排序未改动，未决项继续复用采用前的完整来源绑定。保存确认页显示保留原配置的待选项数量。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/routing-recommendation.test.ts test/routing-recommendation-workflow.test.tsx test/routing-config-workflow.test.tsx`：3 个文件、18 项测试通过。新增混合已确定与待选择口径的回归，核对待选项提供方顺序、具体上游、已确定项采用和输入不变。
- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- 浏览器入口：`apps/desktop/scripts/check-routing-recommendation-review.cjs`，目标 `http://localhost:5173/market-data`；使用已有 `playwright-core`、Node.js 26.13.0 与本地 `chrome-headless-shell`。1440、1024、768、390 四种宽度全部通过。
- 真实页面只读预览：采用行情与净值建议后，3 项待选择仍可进入确认页；服务端返回 5 项来源变更、0 项清空。确认页显示 3 项保留原配置，随后取消；没有保存真实策略。
- 受控样本：保留一个同等候选待选口径，主页面和细分配置保存按钮可用；检查预览与保存请求中的原绑定。分别覆盖待选状态保存失败重试、保存成功、成功后推荐状态清除，以及手动选择后的失败重试与成功。
- 继续验证其他大类隔离、本类撤销、预览取消、页面横向溢出和弹窗边界，浏览器无页面错误。

原始结果位于 `/tmp/routing-partial-save-qa/results.json`，各宽度真实页面与确认页截图位于同一目录。已目视检查 1440、390 宽度的真实确认页。

## 数据与运行边界

浏览器允许真实读取与服务端预览计算；保存请求全部由受控响应接管，其他写请求拦截，真实策略写入为 0。修改已由现有 Vite 开发服务加载；没有执行 Docker 更新、提交或推送。本次结论仅覆盖 T9，不替代同一任务中尚未完成的美股实测。

## 待选择入口验收

对应 AC8 与 T10。“待选择 N 项”使用共享次级按钮，点击后打开本类细分配置。通过 `routingScopeId` 匹配完整精确口径，仅展示当前待选项；原有市场、类型、用途、周期及复权筛选作用于该集合，清空筛选保留待选范围。普通细分入口仍展示本类全部口径。

`pnpm --filter @thesis-ledger/desktop typecheck` 通过。新增浏览器入口 `apps/desktop/scripts/check-routing-pending-navigation.cjs`，复用上述 Node.js、浏览器依赖和 Vite 地址，在 1440、1024、768、390 宽度全部通过：

- 真实页面采用建议后点击“待选择 3 项”，列表标签与推荐理由中 3 个未决精确口径逐项一致。
- 按 ETF 筛选后仅显示对应待选项；清空后恢复 3 项，未泄漏其他口径；保存按钮可用。
- 关闭或返回后从普通细分入口打开，恢复完整范围；弹窗边界和横向溢出检查通过。
- 受控单待选样本手动绑定新浪财经后，当前待选列表变为 0 项，返回后待选按钮消失；普通入口仍可查看已选来源。
- 无页面错误；所有非读取请求均拦截，真实写入为 0。原始结果和截图位于 `/tmp/routing-pending-navigation-qa/`，已目视检查 1440、390 宽度截图。

首次脚本运行的最后一个断言把下拉箭头计入来源文字，已按实际控件的文本结构修正断言；生产代码未因此改变。四宽度最终结果全部通过。T10 没有执行 Docker 更新，不替代其他未完成验收。

## 现有选择状态验收

对应 AC9 与 T11。读取当前草稿及能力目录后确认，内地 ETF 实时、股票实时和股票不复权日线的原主备均已绑定具体接口，全部通过当前推荐候选资格筛选。

推荐候选并列时，现在先核对原有整组绑定；完整且合格的现有来源直接作为已确定选择保留，理由为“推荐候选条件相同，保留现有已选来源”。原有主备顺序和具体上游保持不变。只有原绑定缺少具体接口或来源不合格时继续待选择。

- 定向测试：`pnpm --filter @thesis-ledger/desktop exec vitest run test/routing-existing-selection.test.ts test/routing-recommendation.test.ts test/routing-recommendation-workflow.test.tsx`，3 个文件、22 项通过。新增 9 项覆盖替换主源并列、替换备用并列、已选单源、权限拒绝、凭证缺失、停用、错误市场、缺少绑定及失效绑定。
- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- `check-routing-pending-navigation.cjs`：1440、1024、768、390 宽度全部通过。真实配置的 3 项完整已选绑定显示保留理由，待选按钮为 0；受控去除具体绑定后产生 13 项真正待选口径，限定范围、筛选交集、清空、普通入口和选择后移出均通过。结果及截图：`/tmp/routing-existing-selection-qa/`。
- `check-routing-recommendation-review.cjs`：同样四种宽度全部通过，覆盖真实只读预览、本类撤销、受控待选项部分保存、失败重试及成功。结果及截图：`/tmp/routing-existing-selection-save-qa/`。

已目视检查真实页面截图。测试未保存真实主备策略，真实写入为 0；改动由 Vite 加载，未执行 Docker 更新、提交或推送。以上为当前来源选择状态的验收结果，前两节保留各自验证时的输入与结论。
