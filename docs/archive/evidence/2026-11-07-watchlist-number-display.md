# 自选数值非零展示验证

## 结论与变更

[规格](../../specs/2026-11-07-watchlist-number-display.md)与[任务](../tasks/2026-11-07-watchlist-number-display.md)的 AC1—AC5 在下述稳定源码及受控浏览器边界内通过。Domain watchlist-display 私有价格格式保留普通四位和千分位，格式会归零或绝对值达到 1e21 时采用六位科学计数；零/负零统一显示零，无效值不可用。涨跌幅和 Desktop WatchlistRange 振幅使用同包 formatRatioPercent，原计算、区间有效条件及 SVG 定位不变。

已核对 Desktop Table/Range、Mobile Screen 三个实际消费者。来源、币种、日期、休市、陈旧、未知和刷新失败状态保持；没有改写数值或历史记录。商数本身超出 number 范围时仍不可用，不引入新计算方法。

## 最终验证

先建立反例：旧实现 Domain 新 19 项中 14 项失败，Desktop 新 11 项中 5 项失败。修复后再补四位边界三项，定向 Domain 24 项、Desktop 14 项通过。覆盖普通、极小正负、最小非零、最大有限、零/负零、非法、缺字段、无前收、原商数越界及输入不变。

| 检查 | 命令、输入与结果 |
| --- | --- |
| Domain 完整包 | `pnpm --filter @thesis-ledger/domain exec vitest run`；63 文件、653 项通过 |
| Desktop 完整包 | `pnpm --filter @thesis-ledger/desktop exec vitest run --passWithNoTests`；249 文件、1515 项通过 |
| Mobile 完整包 | `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test --passWithNoTests`；50 文件、210 项通过 |
| Node 24 定向 | Node v24.22.1 直接运行 Vitest，Domain 2 文件 24 项、Desktop 2 文件 14 项通过 |
| 构建 | Domain、Desktop、Mobile、Server 的 `pnpm --filter <包> build` 通过；Domain 构建输入稳定，复用当轮结果 |
| 静态 | 10 个 TypeScript 文件 ESLint、15 个新增验收文件格式、CJS runner/MJS 配置语法及实际执行通过 |
| 仓库门禁 | Node 24 边界、工作区依赖及 `GUARDRAIL_BASE_REF=HEAD` 尺寸门禁通过；6 个既有尺寸告警未增长 |
| 浏览器 | 1440、1024、768、390 下两端各 10 场景，共 80 组通过；零页面错误、零 API/外部请求、零真实写入 |

完整包包含上一轮比例校验中文文案与无效定义的“日线”修正，其此前只有定向补验，本轮已在完整包输入内。未重跑 Server 或 Schema 完整套件；本轮没有这两包的业务修改，先前结果保留原输入边界。

## 实际浏览器与输入

浏览器运行真实 Desktop 表格/区间、真实 Mobile Screen 和基础组件。逐项核对价格、涨跌、振幅；休市快照、陈旧、刷新失败、冷却、未知时间、正式净值日期和不可用；Desktop 菜单打开/Escape/焦点、选中身份、同一行在受控刷新中保留/结束；平板容器内横向滚动；Mobile 管理展开/收起与详情参数。查看窄屏极小/巨大样本，并按文字边界断言重新验证 80 组，采用最终回执。

本机回执前缀 `/tmp/goal-watchlist-`：

- `{domain,desktop,mobile}-full-final.json`、`{domain,desktop}-node24-final.json`：最终测试统计。
- `*-build.log`、`eslint.log`、`format.json`、`{boundaries,dependencies,sizes}.log`：构建与门禁。
- `browser-final/results.json` 与截图：最终 80 组；`browser` 目录保存首轮记录。
- `{desktop,mobile,shared}-inputs-{final-validation,after-browser}.json`、`input-stability.json`：1971、277、2552 个文件稳定，浏览器期间无变化。
- `final-input-delta.json`：初轮后只有测试断言及样本/HTML 格式收尾，完整包已按最终输入重验。
- `extra-inputs.json`：runner SHA256 与三份相同样本的校验值。副本避免应用测试反向引用其他包测试目录。

维护入口为 `apps/desktop/scripts/check-watchlist-number-display.cjs`，QA 配置 `apps/desktop/test/watchlist-number.vite.config.mjs`。使用已安装 Playwright 和显式 Chromium，不新增依赖。用户既有 5173 服务不变；自建 5181 QA 验收后关闭。

## 保留边界

Mobile 在 React Native Web 运行实际页面和基础组件，仅主题/缓存身份/导航钩子提供环境适配；焦点为 false 以防隔离缓存读取。点击详情只记录原组件参数，不代表 Native 导航、Android/iOS 编译或跨端保存重读。走势采用隔离缓存的空图提示，不证明真实行情/分时接入。

真实业务数据只读。主工作区包含其他未提交工作，本轮稳定输入通过不等于主工作区已清理或所有外部验收通过。没有提交、推送、Docker、模型、来源请求或发布；目标运行态、交易时段和原生验收继续由活动任务持有。全线程 Goal 继续。
