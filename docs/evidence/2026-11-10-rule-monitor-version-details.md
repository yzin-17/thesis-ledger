# 资料版本记录展示验收

## 问题与范围

原抽屉只展示截短的内容指纹和首次观察时间，且将指纹标为“摘要”，无法辨认记录的含义。此次仅修改 `apps/desktop/src/features/market-data/RuleSourceMonitorVersions.tsx`，保留工作区已有的抽屉、重试和查询实现。

检查 DSA 的 `src/services/rule_monitor_store.py` 和 `rule_monitor_observations.py` 确认：版本表只保存内容及原始文件指纹、资料包标识、首次及最近观察时间，没有正文快照。版本读取按最近观察时间倒序，最多返回 20 个不同内容指纹；同一内容再次出现时更新最近观察时间。因此页面使用“最近观察”，不将列表序号解释为发布时间、正式版本号或规则生效日期。

此次补充来源地址及“打开来源网页”入口、首次和最近观察时间、可用的资料包标识、完整内容指纹，以及与内容指纹不同的原始文件指纹。页面明确说明未保存正文快照，来源网页展示当前内容。未新增正文归档或差异比较；既有历史记录不能据此还原原文。

## 本地验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-data/RuleSourceMonitorPanel.test.tsx`：8 项通过，存在 React `act` 警告；覆盖查询失败、抽屉重试、加载及空记录等既有交互。
- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- `pnpm --filter @thesis-ledger/desktop build`：最终源码通过类型检查及生产构建，保留现有包体大小提示。日志：`/tmp/rule-monitor-version-build.log`。
- 修改组件的 ESLint、Prettier 检查通过；`scripts/check-boundaries.mjs` 通过；文件尺寸门禁通过，保留 6 项其他文件的存量警告。日志：`/tmp/rule-monitor-version-checks.log`。

## 浏览器验收

入口：`http://localhost:5173/market-data?section=monitor`，使用 Edge 与 Playwright。脚本：`/tmp/check-rule-monitor-versions.cjs`；结果和截图：`/tmp/rule-monitor-versions-qa/`。

分别在 1440、1024、768、390 宽度运行：

- 真实 FINRA 交易活动费 FAQ Q100.22 记录：1 个版本；状态和版本 GET 由实际服务返回。
- 受控多版本样本：只替换浏览器接收的版本 GET 响应，覆盖 2 个版本、不同的两类指纹、空原始指纹、空资料包标识及超长资料包标识。

8 个场景均验证数量和字段展示、来源链接地址及新窗口目标、抽屉边界、页面和内容区无横向溢出、Escape 关闭、键盘聚焦并重新打开、关闭按钮。无页面脚本错误，非只读请求全部拦截且实际计数为 0。人工检查 390 宽度真实记录截图，标题、来源地址、时间及完整指纹均换行可读。

真实记录读取与受控样本分别验证；未通过来源链接重新请求 FINRA，未触发监测检查或修改监测配置、冻结规则及业务数据。此次未执行 Docker 更新，未提交 Git。
