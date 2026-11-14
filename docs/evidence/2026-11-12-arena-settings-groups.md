# 竞技场创建页设置分组验收

日期：2026-11-12。合同：[竞技场界面规格](../specs/2026-11-12-arena-desktop-experience.md) U05。

## 修改范围

Desktop 创建页将合并折叠区改为两个直接展开的模块。研究设置包含研究步骤和时限；行情观察设置包含监测标的数量、观察间隔和可成交行情延迟。标题、字段、间距与单条横向分隔线复用同页其他模块。Mobile 同步采用共享内容分区，精简并分别说明无限与默认值语义。

仅调整两端布局及相关浏览器脚本，未修改参数含义、默认值、保存协议或执行逻辑。原研究不限时、总预算及单次上限语义保持。

## 验证

- Desktop／Mobile 类型检查、Desktop 定向 ESLint、Desktop 生产构建和 `git diff --check` 通过。保留既有 Node localStorage 与 Vite 大包提示。
- `arena-optional-dates-browser.mjs` 在 1440、1024、768、390 验证两个分区直接可见、旧折叠入口移除；三种研究限制组合、清空与默认值、零值拒绝、保存、账户与设置回显、启动／结束均通过。实际窄屏截图核对了标题、分隔和字段层级。
- `arena-live-mobile-browser.mjs` 在相同四宽度验证清空保存、受控详情、图表及直接结束，零页面错误，无横向溢出。Mobile 使用实际 RN Web 业务组件，不代表原生宿主验收。
- 截图分别位于 `/tmp/arena-settings-groups-desktop` 与 `/tmp/arena-settings-groups-mobile`。全部业务请求受控，无真实模型、行情调用或业务比赛写入。
