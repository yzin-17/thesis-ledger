`GATE: ERROR`：设计技能附加脚本未自动找到 Chrome／Edge，且其静态文案检查未读取 SPA 正文；该脚本按自身规则未重试。下述项目实际 Edge 浏览器验收独立通过。

# 实验详情页顶部布局验收

日期：2026-11-12（Asia/Shanghai）。范围为 Desktop 实验详情的返回入口、克隆结果入口及标题操作区。

## 原因与修改

原“查看克隆实验”和“返回 AI 实验”均为直接并排的行内按钮；父容器的纵向 `space-y-4` 不提供横向间距，返回入口还带 `-ml-2`，使悬停底色覆盖相邻按钮边缘。

返回入口独立成行，使用共享 `buttonVariants` 的 `ghost / sm` 导航样式，保留链接语义。标题区采用响应式网格，桌面把克隆结果入口和更多操作放在右侧；窄屏的克隆结果入口换到下一行，更多操作仍留在标题区右上方，不产生单独的空操作行。状态继续由标题徽标表示，去掉副说明中重复的当前阶段；标的名称、代码及基线信息保留并按组换行。

仅修改 `StrategyExperimentDetailPage.tsx`，新增维护验收脚本 `apps/desktop/scripts/check-experiment-header.cjs`。共享按钮、全局样式、接口、克隆写入逻辑和历史实验均未修改。没有新 CSS 选择器、`!important`、专用渲染分支或重复操作组件。

检查了共享 Button 的全部变体和页面中两个入口的组合方式；问题来自此调用处，未修改共享组件。仓库中“查看克隆实验”只在此详情页出现，其他返回入口保持原样。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/market-experiment-recovery.ui.test.tsx test/strategy-experiment-detail.test.ts test/strategy-center-navigation.test.ts`：3 个文件、24 项通过，包含克隆后的读取失败恢复。
- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- `pnpm --filter @thesis-ledger/desktop build`：通过；保留既有大 chunk 警告。
- 本次页面 ESLint、验收脚本 `node --check`、两文件 Prettier 及 `git diff --check`：通过。

实际浏览器入口为当前 Vite 应用 `http://127.0.0.1:5173`，浏览器为项目已有 Playwright 启动的 Microsoft Edge。没有安装新依赖。以下命令分别运行受控交互和真实页面只读验收：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/apps/dsa-web/node_modules/playwright node apps/desktop/scripts/check-experiment-header.cjs
PLAYWRIGHT_MODULE=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/apps/dsa-web/node_modules/playwright node apps/desktop/scripts/check-experiment-header.cjs --live-readonly
```

1440、1024、768、390 四种宽度均完成两类场景。受控场景严格按当前 API Schema 构造响应，只接管克隆 HTTP 请求，不发送真实写入；覆盖两个入口的 hover、聚焦、命中测试、边界不相交、更多菜单展开／Escape 取消、查看克隆及返回列表。真实场景读取现有失败实验 `f2120385-11f7-40b2-9ce5-d59279fcf209`，只检查返回、菜单和原导航，不执行克隆。

两组检查均无页面脚本异常、页面横向溢出或真实写入。窄屏表格仍在自身容器内滚动，保留原行为。最终桌面、平板及窄屏截图已人工检查；尤其复核了窄屏有克隆入口和无克隆入口两种布局。

返回导航采用 `ghost / sm` 后，四种宽度的受控及真实页面场景已复验，hover 时计算样式均为 `box-shadow: none`，键盘聚焦、命中测试和原导航继续通过。键盘焦点环沿用共享组件的可访问性反馈。

克隆结果入口采用共享 `outline / sm` 配合 `cn` 合并原子类，呈现主题色实线边框与平面底色。四种宽度的受控浏览器复验确认 hover 样式中的边框具有有效宽度及可见颜色，装饰阴影均为透明零尺寸，聚焦和原导航继续通过。

回执与 12 张截图位于 `/tmp/experiment-header-qa/`：`receipt.json`、`live-receipt.json`、`hover-return-<宽度>.png`、`hover-clone-<宽度>.png`、`live-<宽度>.png`。临时截图不进入 Git。

初轮浏览器样本遗漏 Compare 的必要 `note` 字段，导致写操作正确禁用；补齐并增加启动前严格 Schema 校验后通过，没有修改产品校验。

## 附加视觉脚本与交付边界

设计技能在 `/tmp/experiment-header-qa` 对真实页面启动门禁后，返回本文开头的 `GATE: ERROR`，未运行它的独立一致性和通用页面检查；因此不声明该附加门禁通过。项目浏览器脚本则成功定位 Microsoft Edge，并实际完成上述全部交互和截图验证。

这是现有业务页面的局部修复，沿用项目视觉体系；未加入营销页的 hero、图片、动效或静态页面标记。代码已由当前 Vite 运行态读取，生产静态构建通过；没有更新 Docker、安装 Electron 包、提交 Git 或推送。
