# 行情数字事实读数验证

## 结论和变更

[规格](../../specs/2026-11-07-market-number-readouts.md)的 AC1—AC6 在下述源码和受控运行边界内通过，对应[任务](../tasks/2026-11-07-market-number-readouts.md)。Domain 的 Market 数字模块明确紧凑最多四位、估值固定四位、测量最多六位、报价金额最少两位最多二十位及币种合同。普通格式会将非零显示为零或绝对值达到 1e21 时改用最多六位科学计数；缺失、非法、真实零与负零分别保持约定。自选投影单向复用该模块。

Desktop 报价、正式净值、当前盘中估值、盘中与历史净值读数、股票 OHLC/量/指标读数、图表说明及区间测量接入。无报价的“最新行情”使用未知标记；测量百分数值沿用既有百分数值入口的六位模式。日期、来源、质量、币种、查询缓存、图表与测量计算保持。

## 最终验证

实际组件新增 43 项回归，原有实现 25 项通过、18 项失败，修改后全部通过；Domain 新增 36 项数字/报价/百分数值边界。覆盖普通分组与精度、舍入边界、极小正负、最小非零、最大有限、零/负零、空与非法输入，以及不可用和真实零的区别。

| 检查 | 命令、输入和结果 |
| --- | --- |
| Domain 完整包 | `pnpm --filter @thesis-ledger/domain exec vitest run`，65 文件、714 项通过 |
| Desktop 完整包 | `pnpm --filter @thesis-ledger/desktop exec vitest run --passWithNoTests`，最终 252 文件、1602 项通过 |
| Mobile 完整包 | `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test --passWithNoTests`，50 文件、210 项通过 |
| Node 24 定向 | Node v24.22.1 直接运行 Vitest，Domain 4 文件 85 项、Desktop 12 文件 129 项通过 |
| 构建 | Domain、Desktop、Mobile、Server 的 `pnpm --filter <包> build` 通过；Domain 复用当轮稳定源码结果 |
| 静态 | 16 个 TypeScript 文件 ESLint 通过，最终浏览器入口另行复核 ESLint；11 个格式检查、CJS 语法与实际执行通过 |
| 仓库门禁 | Node 24 的边界、工作区依赖、`GUARDRAIL_BASE_REF=HEAD` 尺寸通过；6 个既有告警未增长 |
| 实际浏览器 | 四宽共 132 组通过：数字事实 28、百分数值回归 24、自选两端回归 80；零页面错误、零 API/外部请求、零真实写入 |

没有 Mobile 页面、Server 或 Schema 业务修改；Mobile 完整包与构建验证共享模块兼容性，Server 构建验证消费兼容性。未据此重跑 Server 完整套件或宣称真实运行态通过。Desktop 构建仍有既有大 chunk 提示，未调整阈值。

## 浏览器与图形边界

1440、1024、768、390 下运行真实报价、基金净值/当前估值、历史净值读数、OHLC/指标、测量控件、股票图表及盘中图表组件。股票图表使用实际 Lightweight Charts 与实际测量 hook，验证区间选取、取消和重新选取；盘中图表验证历史净值操作。复验此前的全屏/Escape/焦点恢复、净值/今日往返、点击锁定/解锁，以及自选列表菜单、选择、受控刷新保留内容和 Mobile 导航参数。

共用样本包含普通、整数、极小、最小非零、最大有限、零和缺失；Domain/Desktop JSON 为相同字节，API 样本经真实 Schema 解析。最大有限与最小非零直接传入实际读数组件；这两个场景的实际曲线使用 1.2 的有限序列，结果回执明确 plotInput。零正式净值与不接受零的盘中估值 Schema 分开表达。这些隔离组合验证展示合同，不能代表估值算法或真实市场来源。

图表坐标 precision/minMove 沿用现有图形设置；极小值的事实读数使用科学计数，坐标刻度仍按原图形精度。检查实际内容边缘、四宽页面溢出、读数内部滚动及文字/状态，已查看 390 宽度极小和巨大数字的实际截图。原对象、实际 TanStack 缓存经运行前后读取保持一致。

维护入口：`apps/desktop/scripts/check-market-number-readouts.cjs`、`apps/desktop/test/browser-market-number-readouts.html`，并复用百分数值、自选的维护脚本。已有 5173 服务保持运行；Mobile 浏览器适配使用独立缓存的临时 5181 服务，验收后已关闭；浏览器均已关闭。

## 回执与稳定输入

回执前缀 `/tmp/goal-market-number-`：

- `{domain,mobile}-full.json`、`desktop-full-final.json`、`{domain,desktop}-node24.json`：最终测试统计。
- `*-build.log`、`eslint.log`、`browser-eslint.log`、`format.json`、`{boundaries,dependencies,sizes}.log`：构建与静态门禁。
- `browser-final/results.json`、`percent-browser/results.json`、`watchlist-browser/results.json`：28、24、80 组场景与截图。
- `{desktop,mobile,shared}-inputs-{final-validation,after-browser}.json`、`input-stability.json`：1984、277、2558 文件对照。源码、单元测试及依赖未变化；Desktop 唯一差异为浏览器入口的单列网格约束，该入口最终重跑 28 场景、ESLint 和格式检查通过。该变化不进入生产构建或单元测试依赖，不重复未受影响的包级检查。
- `extra-inputs.json`：三个独立 CJS runner、样本及最终浏览器入口 SHA256；样本副本相同。

## 保留边界

真实业务数据只读。主工作区包含其他未提交工作，上述通过仅覆盖记录的稳定输入；不等于整个主工作区清理或外部门禁完成。目标 Docker、真实来源与交易时段、原生宿主和发布由各活动任务继续持有；本轮没有相应动作、提交或推送。全线程 Goal 继续。
