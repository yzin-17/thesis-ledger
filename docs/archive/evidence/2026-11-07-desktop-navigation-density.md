# Desktop 公共导航图标与间距验收

## 结果和所有权

公共 AppShell 的 9 个导航项完成尺寸与间距归一。尺寸、间距、内边距由组合原子类负责；移除旧 CSS 对同一属性的覆盖，SVG 和短标签禁止收缩。纵向排列与短标签使用与现有布局一致的 800px 及以下媒体条件。颜色、选中指示、强制颜色、路由、模式及折叠状态保留原合同。

实际生产资源在 1440、1024、801、800、768、521、520、390、320 宽度通过；包含折叠、展开与折叠后的断点往返，共 17 个状态、153 次图标和文字检查。完整 Desktop 254 文件、1620 项通过，全线程 Goal 继续。

## 根因与实际复现

保存上一轮生产资源于 `/tmp/goal-navigation-before-dist`，通过独立静态服务读取；基线和当前分别在新浏览器上下文、同一受控业务响应下执行相同导航检查。

| 宽度 | 基线 | 当前 |
| --- | --- | --- |
| 320、390、520 | 每个图标由 19×19 压至 19×2；实际间距 11px、垂直内边距 9px | 每个图标 19×19；间距 4px、垂直内边距 2px |
| 800 | 9 个导航项长短文字均隐藏，控件高度 40px | 9 个短标签完整显示，控件至少 48px |
| 521、768、801、1024、1440 | 图标正常；保留既有侧栏和折叠合同 | 图标正常；标签、路由与折叠往返通过 |

基线共 45 项尺寸/标签检测失败，来自上述两处布局根因；当前为 0。基线宽度切换会触发网格动画，最终检查等待应用壳自身动画结束，不把动画中间尺寸当成稳定布局。

## 交互与真实浏览器

使用实际 App、Router、共享模式控制、查询和 API client。每个宽度检查全部 9 个可访问中文名称和 href、唯一当前页、容器内横向滚动、图标与文字不越出导航项、文档无横向溢出。按 Tab/Shift+Tab 往返，Enter 打开设置后浏览器返回；实际/模拟模式切换及持仓账户映射通过。可折叠宽度检查展开/收起，1440 还覆盖折叠后 768 再回到 1440。

维护入口 `apps/desktop/scripts/check-desktop-navigation.cjs`。两轮均完成 9 个宽度及各 17 个状态；结果分别为 `/tmp/goal-navigation-baseline-browser/results.json`、`/tmp/goal-navigation-current-browser/results.json`，每轮 12 张实际截图。检查了当前 390、800 与 801 折叠截图，导航图标、标签和选中指示完整。

全部业务 API 为受控 GET，写入、外部来源、未配置响应及未捕获异常均为 0。没有发起真实行情、模型、通知或业务写入。

## 最终验证

| 验证 | 结果 |
| --- | --- |
| 定向交互 | 3 文件、14 项通过，`/tmp/goal-navigation-focused-final.json` |
| Desktop 完整包 | 254 文件、1620 项通过，`/tmp/goal-navigation-full-final.json` |
| Node 24 | 首轮 11/14 通过，3 个路由用例约 5 秒超时；同一输入单文件复跑 3/3 通过，耗时 3.34 秒。保留 `/tmp/goal-navigation-node24-final.json` 和 `/tmp/goal-navigation-node24-global-rerun.json`，未修改超时设置或测试断言 |
| 生产构建 | 类型检查与 Vite 构建通过，`/tmp/goal-navigation-build.log`；仍有原大 chunk 提示 |
| 静态检查 | AppShell 的 ESLint、格式检查，浏览器入口格式及 Node 24 语法检查、触及 diff 空白检查通过；旧 CSS 仅删除所拥有的间距规则 |
| 仓库门禁 | Node 24 boundaries、workspace dependencies、`GUARDRAIL_BASE_REF=HEAD` 尺寸门禁通过；6 个既有告警未增加 |
| 体积保护 | 相对按需加载前基线，最终入口静态闭包 1,215,702 字节，仍减少 57.40%，`/tmp/goal-navigation-bundle.json` |
| 稳定输入 | 最终完整包前后 1999 个 Desktop 文件无增删或哈希变化；282 个 Mobile、2562 个 Server/Domain/共享输入与上一轮相同，复用 Domain 767、Mobile 222 项及相应构建，见[共享稳定证据](../../evidence/2026-11-07-fund-daily-decimal-display.md#最终验证) |

最终输入 `/tmp/goal-navigation-desktop-inputs-final-validation.json`、`/tmp/goal-navigation-desktop-inputs-after-browser.json`，复用清单 `/tmp/goal-navigation-reuse.json`；独立维护脚本哈希及格式结果 `/tmp/goal-navigation-extra-inputs.json`。完整包与 Node 24 独立复跑输入一致；并行超时保留其实际失败范围。

本轮仅调整 AppShell 与对应旧 CSS 规则；没有改动业务页面、数据、接口、精度、原生工程、Docker 或发布。真实目标运行态和来源仍由各活动任务独立验收。实际证据不能把整个脏工作区视为已提交或已部署。
