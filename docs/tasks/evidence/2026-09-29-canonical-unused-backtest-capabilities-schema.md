# 停用回测 V2 能力汇总合同清理

## 调用与变更

DSA 的旧能力汇总端点此前已删除。源码反查显示 `backtestCapabilitiesSchema`、`dataCapabilitySchema` 仅由 Schemas 旧测试使用；旧 T13 脚本只读取其 fixture 与已不存在的 V2 能力 URL，未被当前 package/CI 入口调用。本叶删除旧汇总解析器、类型、fixture 和 T13 脚本。市场/周期策略边界测试保留；日历与 NAV 可见时间继续直接按事实 Schema 验证。历史架构说明已标记该门禁退役，历史基准报告保留当时证据。

## 本地验证

- 相关 Schemas 定向 10 项、全包 543 项通过；Schemas 构建、Server/Desktop/API Client 类型检查与模块边界通过。
- 仍在使用的账户事实域隔离脚本通过，扫描 121 个文件；`git diff --check` 通过。
- 两份受影响测试文件的 Prettier 检查通过。`backtest-data.ts` 整文件检查仍因本叶未触及的公司行动日期校验区段存在格式差异而未通过；未扩大写集统一格式化。

## 尚未完成

当前逐能力目录、真实 DSA 来源、NAV 冻结与目标 Server/Worker 尚未验收。C01/C03、E01/E04、D02/D03 与多来源 M1/M2/M3 均保持未完成。
