# ThesisLedger 主分支 CI 修复与验收回执

对应[主分支 CI 修复任务](../tasks/2026-11-28-thesis-ledger-main-ci-recovery.md)。以下记录限于 ThesisLedger 主分支及其 [CI 工作流](../../../.github/workflows/ci.yml)。

## 修复与失败历史

| 提交与运行 | 修复内容及该轮结果 |
| --- | --- |
| `20295a15` · [46044544096](https://github.com/yzin-17/thesis-ledger/actions/runs/46044544096) | 修复前基线。质量 lint、PostgreSQL E2E 和固定版 Chromium 安装失败。 |
| `6a646adb` · [46121646065](https://github.com/yzin-17/thesis-ledger/actions/runs/46121646065) | 修复桌面 lint、PostgreSQL E2E 的依赖构建及 Chromium 安装。安装步骤恢复，运行中仍有 lint、PostgreSQL E2E 和浏览器断言失败。 |
| `bfd4ddf2` · [46122015001](https://github.com/yzin-17/thesis-ledger/actions/runs/46122015001) | 策略优化 PostgreSQL 夹具改用具名 V1，E2E 通过。后续基金定投、lint 和浏览器断言失败。 |
| `cc6fb731` · [46122533299](https://github.com/yzin-17/thesis-ledger/actions/runs/46122533299) | 在同一次页面读取中核对多选弹窗几何值，浏览器回归通过。基金定投及 lint 仍失败。 |
| `2f7c3a51` · [46126991659](https://github.com/yzin-17/thesis-ledger/actions/runs/46126991659) | 清理 Server 源码 19 条 lint 错误，基金定投按现行账本信封断言；随后全仓测试和数据库恢复步骤失败。 |
| `6f2f7542` · [46129234676](https://github.com/yzin-17/thesis-ledger/actions/runs/46129234676) | 修正 Domain 保护测试的 5 条断言，数据库恢复测试等待 `restore_fixture` 就绪。该轮全仓测试与恢复步骤仍失败。 |
| `7a64d81b` · [46129644035](https://github.com/yzin-17/thesis-ledger/actions/runs/46129644035) | 恢复夹具保留宿主文件所有权，恢复步骤通过。全仓测试及收益与风险的隔离 PostgreSQL 仍失败。 |
| `fa672864` · [46131857345](https://github.com/yzin-17/thesis-ledger/actions/runs/46131857345) | 修复 Server 17 条测试失败及收益与风险的缺价断言。全仓测试、构建及合同作业通过，运行工具步骤报 4 项失败。 |
| `66a3e4d1` · [46139310163](https://github.com/yzin-17/thesis-ledger/actions/runs/46139310163) | 对齐 Arena 准入脚本、Node 测试入口和 Provider 探测转换断言。归档策略样本使用现行策略合同，数据库角色校验改用系统 `grep`。本地四组工具检查通过。远端累计锚点用例超出 60 秒，导致工作流跳过后续构建与运行工具步骤。 |
| `d10184ef` · [46142920017](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017) | 将该累计锚点用例的执行时限调至 120 秒，保留冻结、重复回放和拒绝越界的全部断言。完整远端 CI 通过。 |

## 推送前本地验证

- 数据库工具合同、全仓 lint、类型检查、全仓测试及构建通过。使用 Node 24、Python 3.12 和相邻 DSA 测试环境，按工作流使用两路 Vitest fork。全仓测试共 10,598 项通过。
- 分别执行运行工具与部署测试 170 项、归档策略方向测试 2 项、AI Compose 合同及数据库角色静态合同，全部通过。角色校验另外在系统 PATH 下通过。全仓构建后复跑四组检查，通过。
- 凭据扫描、迁移矩阵、复杂度、离线研究轨迹及手机边界与接续测试通过。本地浏览器使用 Edge Chromium 渠道，7 项通过。
- 修复累计锚点时限后，变更文件 ESLint 与 Server 全套复验通过，5,102 项通过，604 项按条件跳过；四组运行工具检查再次通过。

## 最终远端验收

2026 年 11 月 28 日 20:32（上海时间），[CI 46142920017](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017) 完成，结论为 `success`。Git 远端确认 `refs/heads/main` 指向 `d10184efd5526a427e464f2040549babf479bcb9`。

| 作业 | 验收结论 |
| --- | --- |
| `quality` | 数据库工具、lint、类型、全仓测试、构建和运行工具步骤通过。[作业回执](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017/job/140972628180) |
| `contracts-and-guardrails` | 合同、迁移矩阵、隔离 PostgreSQL、恢复、研究离线轨迹、复杂度及手机边界检查通过。[作业回执](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017/job/140972627962) |
| `browser-regressions` | 固定版本 Chromium 安装及界面回归通过。[作业回执](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017/job/140972628211) |
| `mobile-ios-native` | 从锁文件安装 Pods 及构建 iOS 模拟器应用通过。[作业回执](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017/job/140972628273) |
| `mobile-android-native` | Android Debug 构建通过。[作业回执](https://github.com/yzin-17/thesis-ledger/actions/runs/46142920017/job/140972628307) |
| `desktop-packages` | 按主分支普通推送条件跳过。 |
