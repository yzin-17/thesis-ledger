# Desktop 页面按需加载验收证据

## 结果与范围

本轮完成应用层页面加载 Interface、10 个主页面 Adapter、收益分析与交易分区接入，以及独立的收益页签 URL 投影。默认组合概览与收益工作区一起加载，工作区内部的分析、配置目标和交易实现按呈现加载。账户、模式、查询缓存和导航保护继续由原 Module 拥有。

入口和初始静态依赖闭包减少 57.41%；完整 Desktop 254 个文件、1620 项测试及生产构建通过。实际生产资源在 1440、1024、768、390 宽度通过 24 个当前场景和 8 个基线场景。全线程 Goal 继续，目标运行态、真实来源和其他任务的验收边界保持各自记录。

## 生产资源比较

基线来自上一轮基金误差展示构建，完整资源保存在 `/tmp/goal-deferred-pages-baseline-dist`。当前资源来自本轮 `pnpm --filter @thesis-ledger/desktop build`；未调整 chunk 阈值或加入人工分包配置。

| 范围 | 基线字节 | 当前字节 | 降幅 | 基线 gzip | 当前 gzip | gzip 降幅 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 入口及初始静态 JS 闭包 | 2,854,018 | 1,215,492 | 57.41% | 868,124 | 367,004 | 57.72% |
| 默认收益页实际全部脚本 | 2,854,018 | 1,636,051 | 42.68% | 868,124 | 511,846 | 41.04% |
| 数据与自动化页实际全部脚本 | 2,854,018 | 1,476,248 | 48.27% | 868,124 | 460,372 | 46.97% |

静态分析使用 TypeScript AST 递归收集静态 import/export 与 HTML Module preload，排除动态 import；初始闭包两轮均为一个 JS 文件。实际请求量取自独立新浏览器上下文成功响应的完整脚本内容，包含动态依赖：当前收益页 24 个、设置页 20 个脚本，四宽的结果相同。gzip 为每个响应内容独立压缩后的合计，用于资源大小比较；本地静态服务器未据此宣称真实网络压缩或生产延迟。

当前入口 `assets/index-DBNwyrcY.js` 的 SHA-256 为 `3c6b83565cc18fe285a0bf0a24e76116eace73cc88b5d80dac8f406bddd6a296`。构建仍提示存在超过 500 kB 的 chunk；本轮没有把这项提示消除，也未量取远端网络下的首次可交互时间。

可复用入口：`apps/desktop/scripts/check-desktop-startup-bundle.cjs`；比较结果 `/tmp/goal-deferred-pages-bundle.json`，构建日志 `/tmp/goal-deferred-pages-build.log`。

## 加载、状态与浏览器

实际运行 App、Router、TanStack Query、API client 和生产资源。临时静态服务分别使用 5182、5183；用户既有 5173 服务保留。每个场景新建上下文，拦截全部业务 API，并阻断外部来源和写入。正常账户、持仓、目标、目录及空列表响应经项目实际 Schema 校验；配置比较的 POST 仅返回隔离计算结果。

| 当前场景 | 四宽场景数 | 主要断言 |
| --- | ---: | --- |
| 两个直接进入页面 | 8 | 完整渲染和实际脚本请求量；没有提前加载研究、策略、自选页面 |
| 账户、模式与草稿往返 | 4 | 账户二选择、配置目标加载、Esc 继续编辑、浏览器返回被阻止、输入 61 原样保留、明确放弃关闭、跨页返回保留账户、模拟选项不含实际账户 |
| 慢加载 | 4 | 页面出现共享加载圈，导航仍可操作；离开后加载完成不会替换当前页面，返回只请求该页面一次 |
| 失败与重载恢复 | 4 | chunk 503 显示页面失败和重载按钮；可切换设置，返回复用失败状态；恢复后重载成功，请求次数从一次变两次 |
| 旧地址 | 4 | `/portfolio` 保留账户与 allocation 页签；`/position-entry`、`/import-review` 转到账户持仓并保留账户 |

合计 460 个受控 GET、20 个受控配置计算 POST；真实写入、外部来源、未配置响应及浏览器未捕获异常均为 0。页面文案、表单、表格与导航在实际截图中检查；文档横向溢出及可见对话框边界自动断言通过。查看窄屏加载、失败和草稿以及桌面草稿截图，控件和文字可读。

维护入口 `apps/desktop/scripts/check-deferred-page-loading.cjs`，隔离数据 `apps/desktop/test/deferred-page-browser-fixtures.cjs`。基线 `/tmp/goal-deferred-pages-baseline-browser/results.json`（8 场景），当前 `/tmp/goal-deferred-pages-current-browser/results.json`（24 场景）；两目录合计 40 张实际截图。

加载 Interface 的 6 项回归覆盖未访问不加载、异步 props、原状态身份、跨实例代码缓存与独立状态、卸载后的迟到结果、加载及渲染失败保留导航。其余回归覆盖既有账户往返、模式切换、独立实验输入、收益页签和默认概览服务端渲染。

## 最终验证

| 验证 | 结果与输入边界 |
| --- | --- |
| Desktop 定向 | 7 文件、38 项通过，`/tmp/goal-deferred-pages-focused-final.json` |
| Node 24 定向 | 同一 7 文件、38 项通过；`/tmp/goal-deferred-pages-node24.json` 的 4 文件 25 项与 `/tmp/goal-deferred-pages-node24-additional.json` 的 3 文件 13 项互不重复 |
| Desktop 完整包 | 254 文件、1620 项通过，`/tmp/goal-deferred-pages-full.json`；执行时 pnpm 运行时为 Node 26.13.0 |
| Desktop 类型及生产构建 | 通过；`/tmp/goal-deferred-pages-typecheck-v3.log`、`/tmp/goal-deferred-pages-build.log` |
| 静态检查 | 9 个 TS/TSX 的 ESLint、7 个完整新文件的格式检查、3 个 CJS 的 Node 24 语法检查、所触及 diff 空白检查通过；旧文件仅修改所属片段 |
| 仓库门禁 | Node 24 执行 boundaries、workspace dependencies、`GUARDRAIL_BASE_REF=HEAD` 尺寸门禁通过；6 个既有尺寸告警不增长 |
| 其他包复用 | Mobile 51 文件 / 222 项、Domain 66 文件 / 767 项及相关构建沿用[上一轮稳定证据](../../evidence/2026-11-07-fund-daily-decimal-display.md#最终验证)；282 个 Mobile 输入与 2562 个 Server/Domain/共享契约输入无增删或哈希变化 |

Desktop 完整验证前后清单均为 1999 个文件；只有浏览器隔离响应文件在补齐受控端点时更新，最终已由四宽实际浏览器重新验证。产品源码、单元用例、依赖及构建输入保持稳定，无需重跑未变更的完整包。最终清单 `/tmp/goal-deferred-pages-desktop-inputs-final.json`，差异与复用 `/tmp/goal-deferred-pages-input-delta.json`、`/tmp/goal-deferred-pages-reused-validation-inputs.json`；两个维护脚本和边界门禁额外哈希在 `/tmp/goal-deferred-pages-extra-inputs.json`。

## 所有权和保留边界

`DeferredPage` 和稳定页面注册由应用层拥有；feature 不能反向导入应用加载器，轻量页签投影不能依赖页面实现，该方向已固化到 `scripts/check-boundaries.mjs`。原请求、业务状态、数据精度与提交值不变。按需请求带来额外脚本请求次数，远端网络与目标运行态体验仍需在对应部署范围验收。

本轮未执行 Docker、数据库、外部来源、模型、通知、原生编译、提交、推送或发布；真实业务记录保持只读，其他任务未通过的来源和运行态门禁没有被本轮受控浏览器替代。

实施合同参考 [React lazy](https://react.dev/reference/react/lazy) 与 [Suspense](https://react.dev/reference/react/Suspense)；组件组合核对锁定 shadcn CLI 返回的 [Alert](https://ui.shadcn.com/docs/components/base/alert)、[Spinner](https://ui.shadcn.com/docs/components/base/spinner)、[Tabs](https://ui.shadcn.com/docs/components/base/tabs) 和对应上游示例。加载声明位于 Module 顶层，保持 React 的 Promise 缓存及组件身份。
