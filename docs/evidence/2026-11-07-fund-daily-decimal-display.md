# 基金收盘估算误差精确展示验证

## 结论与实现

[规格](../specs/2026-11-07-fund-daily-decimal-display.md)的 AC1—AC5 在下述源码与受控运行边界内通过，对应[任务](../archive/tasks/2026-11-07-fund-daily-decimal-display.md)。Domain 新增 formatDecimalNumber：十进制原文最多六位、分组、可选正号；普通舍入、任意指数和科学计数共享既有比例文本的有效数字/独立 BigInt 指数实现。原值不经 Number 转换，非零不因显示精度归零，负零归一为零；不可用显示未知。

既有比例模块单向消费共享格式器，二/三/六位、比例与百分数值及符号 API 保持。依赖门禁增加新模块的应用/请求适配层隔离。两端每日估算和正式净值复用 Market 数字合同，差额采用六位精确文本与非零正号，Mobile 补齐同一响应的差额和低覆盖提示。日期、相对绝对误差、等待、空、失败重试与查询身份保持，未修改原始记录或计算。

## 最终验证

两端实际组件新增 24 项回归，原实现 7 项通过、17 项失败，修改后全部通过；Domain 新增 53 项精确文本、六位舍入、普通分组、正负/负零、极小、超浮点范围、任意指数、空及非法值回归。

| 检查 | 命令、输入与结果 |
| --- | --- |
| Domain 完整包 | `pnpm --filter @thesis-ledger/domain exec vitest run`，最终 66 文件、767 项通过 |
| Desktop 完整包 | `pnpm --filter @thesis-ledger/desktop exec vitest run --passWithNoTests`，最终 253 文件、1614 项通过 |
| Mobile 完整包 | `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test --passWithNoTests`，最终 51 文件、222 项通过 |
| 定向组件 | Desktop 4 文件 103 项、Mobile 2 文件 16 项通过 |
| Node 24 | Node v24.22.1 直接运行 Vitest：Domain 8 文件 203 项、Desktop 2 文件 23 项、Mobile 2 文件 16 项通过 |
| 构建 | Domain、Desktop、Mobile、Server 四包 build 通过；Domain 最终产物及消费源码在浏览器期间稳定 |
| 静态 | 13 个 TypeScript 文件 ESLint、19 个格式检查通过；最终 3 个浏览器入口/适配文件另行复核 ESLint；CJS/mjs 语法与实际执行通过 |
| 仓库门禁 | Node 24 的边界、工作区依赖、`GUARDRAIL_BASE_REF=HEAD` 尺寸通过；6 个既有告警未增长 |
| 实际浏览器 | 每日误差 112 个两端四宽场景，另有原文本比例 32 组双端回归（64 页面）；均通过，无页面错误或横向溢出 |

本轮没有 Server 业务或 Schema 修改，Server 构建验证公共导出兼容性，没有重跑其完整套件。Desktop 既有大 chunk 提示仍在，未放宽阈值。Native 工程未变，浏览器的 RN Web 验收不代表 Native 编译。

## 两端浏览器与数据保护

1440、1024、768、390 各宽度验证普通分组、正负舍入边界、极小正负、最小非零、最大有限、超大文本指数、零差额，以及等待正式净值、空、失败、同范围刷新和首次加载。实际组件使用真实 TanStack Query；Mobile 复用实际 RN Web primitives、主题及公共 API client。已查看 390 宽度的巨大指数与极小负差额截图，确认文本在容器内可读。

8 个失败场景逐一点击真实“重新读取”，实际 API client 发起 GET 并经 Schema 解析恢复；请求全部由浏览器拦截提供隔离响应，没有访问服务器或外部来源。刷新与首次加载由受控缓存状态完成，等待实际内容和加载状态更新；刷新保留原内容。原文本比例回归同时检查冻结结果、模型费率、竞技场观察和基金相对误差，确认模型确认操作保持原文本。

两端 JSON 样本与 builder 分别相同字节，样本经过 fundDailyErrorSchema。极端差额与净值字段分别用于 API 展示边界，不作为真实估值计算结果。前后读取原对象和实际缓存；重试/首次加载只按指定响应填充缓存，其余缓存内容完全一致。合计零真实业务写入、零真实来源读取、零意外请求。

维护入口：`apps/desktop/scripts/check-fund-daily-number-display.cjs`、`apps/desktop/test/browser-fund-daily-number.html`、`apps/desktop/test/browser-fund-daily-number-mobile.html`、`apps/desktop/test/fund-daily-number.vite.config.mjs`。原有 5173 服务保持运行，临时 5181 使用独立优化缓存；验收后关闭临时服务与所有浏览器。

## 回执与输入

回执前缀 `/tmp/goal-fund-daily-`：

- `{desktop,mobile}-before.json`：24 项实际组件的修改前基线。
- `{domain,desktop,mobile}-full-final.json`、`{domain,desktop}-node24-final.json`、`mobile-node24.json`：最终包级与兼容结果。
- `*-build*.log`、`eslint-final.log`、`browser-eslint.log`、`format-final.json`、`{boundaries,dependencies,sizes}.log`：构建和门禁。
- `browser-proof/results.json`：112 个场景、8 次受控 GET；`ratio-browser-proof/results.json`：32 组双端回归；对应目录含截图。
- `{desktop,mobile,shared}-inputs-{final-validation,after-browser}.json`、`input-stability.json`：1994、282、2562 文件对照；生产源码、单元测试及依赖均未变化。Desktop 一个浏览器入口、Mobile 入口及适配器在最终包级之后增加诊断/传输适配，最终浏览器、ESLint 和格式复核通过，未重复未受影响的包级检查。
- `fixture-consistency.json`、`extra-inputs.json`：样本/builder 字节一致性与独立脚本、门禁的 SHA256。

## 保留边界

主工作区保留其他未提交修改，以上通过仅覆盖记录的输入范围。每日后台冻结与真实同日净值的既有事实仍以其原验证记录为准；本轮不扩展目标 Docker、真实交易时段、来源、原生宿主或发布结论，也没有相应动作、提交或推送。全线程 Goal 继续。
