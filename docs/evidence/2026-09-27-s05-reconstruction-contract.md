# S05 历史重建清单合同实施记录

## 已完成范围

`S05-reconstruction-contract` 已完成。共享严格合同绑定精确标的、RouteKey、固定目标、日期窗口、序列版本、输入指纹、完整来源价格事实及 `dataAsOf`；逐 Bar 引用不可变窗口身份和原响应摘要。乱序、重复时点、同一窗口冲突摘要、自报抓取时刻及内联价格均拒绝。

`bindMarketPitReconstructionProofV3` 只返回 `bound` 或带原因的 `unavailable`，不返回历史资格。父项 `S05-reconstruction` 和 S05 继续开放。

## 本地验证

- 定向 `test/market-pit-reconstruction-v3.test.ts`：28 项通过，包含于 Schemas 全包 41 文件/395 项，不重复计数。
- Schemas typecheck/build、Server typecheck、两个新增文件定向 ESLint、边界和工作区依赖检查、diff check 通过。编译包实际导出合同与绑定函数，空清单被拒绝。
- 尺寸门禁返回 13 项既有无基线警告，不能据此宣称已有尺寸债务消除。
- 日志前缀 `/private/tmp/goal-s05-reconstruction-contract-`，后缀 `-20260927.log`；范围包括 directed、package、lint、typecheck、build、server-typecheck、boundaries、workspace、sizes。当前核查文件仍存在，记录的成功统计与上述一致。

## 仍待完成

实际只读清单、原归档内容和摘要读取、逐 Bar 历史修订/可见时刻验证，以及预检与 Snapshot 冻结消费继续实施。生产预检现有非空引用判断尚未替换；本记录不证明该缺口已修复。

没有运行 PostgreSQL、目标 Docker、外部 Provider 或浏览器验收，没有创建回测/AI 任务。当前合同尚未接入生产消费链，未重复同步未使用的合同代码。I01 完整响应 JSONB 往返卡点保持既有耗尽重试记录；受控清单与摘要不能替代真实归档证据。
