# 细分具体来源选择验收

## 实现

2026-11-10，Desktop 细分来源候选只生成具体接口；大类默认继续以提供方为单位。已有具体绑定及不可用来源回显保持。未绑定且只有一个接口时回显唯一来源；多接口时使用 Select 原生空值和“请选择具体来源”占位，不把首项显示为已选，不向候选列表加入占位项。

`MarketPolicyChoice` 增加可选占位文字并接受空选值，其他调用方继续使用原有值与标签映射。选择接口继续复用已有精确绑定更新、主备去重和权限过滤；未创建新的通用工具函数。

## 保存请求阻塞及修复

浏览器选择接口后，实际保存前检查返回 413。当前读取配置约 103476 字节，其中 144 条 `preserved` 记录约 59872 字节。检查服务端 `MarketRoutingConfigService.prepare` 确认其覆盖客户端 `preserved` 并从数据库恢复可信记录。

`useRoutingConfig` 现在只在检查和保存请求中令 `preserved` 为空数组，本地草稿、基线和可信数据保持；没有改正文预算、放宽校验或更改数据库。最终浏览器检查请求为 43638 字节，实际服务端通过检查并进入确认保存界面。工作流测试覆盖检查与失败保存的请求精简，以及本地记录保持。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/routing-config-workflow.test.tsx test/routing-source-choices.test.ts test/routing-capability-options.test.ts test/routing-recommendation.test.ts`：4 文件、22 项通过。
- Desktop 类型检查及生产构建、修改文件 ESLint、Prettier 通过。构建日志 `/tmp/routing-explicit-source-build.log`。
- `pnpm exec node scripts/check-boundaries.mjs` 通过；尺寸门禁通过，保留 6 项无关存量警告。
- 当前安装的 Base UI Select 声明及[官方占位说明](https://base-ui.com/react/components/select.md)确认可用 `null` 与 `Select.Value` 的 `placeholder` 表达尚未选择，不产生选择事件。

## 实际浏览器

入口 `pnpm exec node apps/desktop/scripts/check-routing-explicit-source.cjs`，使用现有 Playwright 和 Microsoft Edge：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
MARKET_ROUTE_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
```

连接实际 Vite `http://localhost:5173/market-data`；用受控 GET 响应将一个前复权日线子项设为旧式未绑定接口状态，真实配置和历史未改写。提供方和目录使用实际读取，POST 检查由实际服务处理，所有其他写请求禁止透传。

1440、1024、768、390 均通过：

- 打开页面不产生未保存修改；AKShare 多接口在触发器中显示“请选择具体来源”，下拉候选仅为具体接口及原有清空入口。
- 选择东方财富后实际提交 `akshare: eastmoney`，未改变当前主备顺序；所有其他规则与能力键保持原样。
- 服务端检查成功并进入“确认保存配置”；返回修改后所选具体接口保持。
- 弹窗和下拉未越界、页面没有横向溢出，浏览器错误和真实业务写入均为 0。

首次脚本把控件图标文本计入标签，调整为验证标签前缀与实际提交绑定；随后定位并解除上述 413 阻塞后，四宽检查全部通过。未把受控旧配置场景扩展为真实历史数据迁移结论。

截图及结果位于 `/tmp/routing-explicit-source-qa/`，包含 `options-{1440,1024,768,390}.png` 与 `results.json`。已实际查看桌面与 390px 下拉截图。

## 最终核对

AC1–AC2 由候选和回显测试及四宽下拉验证；AC3 由实际检查请求、返回修改和范围保护断言验证；AC4 由工作流测试及真实 POST 成功验证。相关细分编辑规格已同步。前端由现有 Vite 使用当前源码，未执行 Docker 更新、实际配置保存或 Git 提交；无本范围未完成事项。
