# 159516 真实 AI 实验与封存测试

## 目标与配置

目标 Web 与目标 Server/Worker 上创建实验 `0830412c-6aa6-4608-b0fd-3a59c7c50763`，以普通策略版本 `08ac7d30-d1a0-4ba2-8d7e-338cebe4c9e4` 为固定基线。实验使用已配置且从 Server 容器返回 HTTP 200 的 LMStudio 模型 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`，不使用 OpenRouter。数据范围为 `159516.SZ` 前复权固定供应商快照：开发 `2026-05-18..06-12`、验证 `2026-06-13..07-03`、封存测试 `2026-07-04..08-07`；预算为 2 次模型调用、8 次回测、输入 20000／输出 5000 token、1800 秒，预热预算 1 个交易日。执行模型沿用已完成普通 Run 的显式归一化零成本研究假设。准备配置成功后才创建实验。

## 真实终态与读取边界

- 实验 `succeeded/completed`；模型调用 2 次，均 `succeeded`，报告输入 1624、输出 4446 token；费用汇总为 `partial/historical_missing_metadata`，不能视为已核算金额。8 个回测 Run 均 `succeeded`，均由 `thesis-ledger-v3-local-runner-v2` 执行。实验数据指纹 `8a348f9195ab5283bbafeb26e0e36155ea747c26849676cdaf8a07a84a305109`，开发／验证／测试冻结指纹分别为 `45d1ae41816519682b827d8c7e8a88e6fda09f6a7eb4b674c6c553ba3a8ece86`、`d2015ea48220d0df9d393deaad7d5f7afc1b295157957aea3f63249401d1adf4`、`412402039e0702734181161ef76a60c0e29bb38e361586be488734d331bd632e`。
- 基线开发／验证／测试 Run 分别为 `0c2ac318-93af-4e7a-b74d-386740e8ec2f`、`4a9e5b7c-c00c-44c1-890c-47f490f1e791`、`2ef9b829-3d9b-444b-9c19-b82247db1983`。收益分别为 `0.05438618865666425274`、`-0.00863309352517985612`、`0.00201546394763358065`；封存测试最大回撤 `-0.06029579067121729238`。
- 候选 1 `cd92b1a2-5aeb-4d67-a677-7ee492ca4641` 的开发／验证 Run 为 `afc925aa-7ac1-403e-97ba-6dd9733220c8`、`183131fc-1c2e-4105-b98f-585e0d69de19`；验证收益 `-0.01294964028776978417`。候选 1 未锁定、未运行封存测试，服务端没有其测试 Run 引用。
- 候选 2 `99b5bbda-982d-482a-ac01-57e0a3e42d34` 的开发／验证／测试 Run 为 `5795c06e-163f-474c-a524-89d616cc5955`、`a7f4aa39-ddce-4441-915f-ac3213e08c6e`、`7f5f9c63-c767-45ff-92e2-4c9a006f1f93`；验证收益 `-0.01035971223021582734`，测试收益 `0.00177725274565410589`、最大回撤 `-0.07235494880546075085`。候选 2 是唯一锁定和预选的候选。测试收益低于基线且回撤更大，未执行策略采纳；`adoptedCandidateId` 为空。
- 逐 split 对照全部 8 个目标 Run：同 split 的基线与候选 `runConfig`、结果 `executionPriceProtocol`、`comparableDataFingerprint`、`engineVersion`、`calendarVersion`、`marketRuleVersion`、`aggregationVersion` 均相同。开发、验证、测试的可比较数据指纹分别为 `5268d83eafde5b668c7818a223c8c8ceb2c29c4fcfc7aae6084e6593ac003cc9`、`fe833abb0c55e138ec865f61131047f9143e1ab5aec64218caef83754dc9939d`、`a587d7f9ccf7195c186ac2b4cf591b968ea08748e6a30f66bea03f71d5d428ac`；模型候选没有改变该次实际执行的数据协议。各 split 有自己的冻结窗口与指纹，不能跨 split 当作同一数据段。
- 目标 Worker 以 `LocalSnapshotV3RunnerV2` 对全部 8 个 Run 的冻结 Snapshot 执行只读重放；每条结果均 `complete`、引擎均 `thesis-ledger-v3-local-runner-v2`，8/8 `resultChecksum` 与目标 Server 持久化值一致。基线与候选封存测试 Run 的校验值分别为 `7d1c556b9328a99c`、`ac84c0ab38e87348`，其 Snapshot ID 分别为 `a477b21b37308f720bd724877309673748a67b27761d4eb05c25cc91c34bbbd6`、`aab88f6315522516d5d7d4e9379f81762283276838aa61bb9e7ec76df582f8eb`。重放未重取行情、未修改已完成 Run。
- 封存测试前，候选读模型把编码测试终态的 `validationStatus` 投影为 `restricted`，测试 Run 与指标未揭示；目标界面原先以该状态直接判断可锁定，导致公开的开发／验证均有效却无按钮。界面现仅依据公开的开发／验证指标允许锁定，Server 仍按持久化状态复核。锁定后结果才揭示。完成后的目标页面明确显示候选 1“未进入封存测试”，不再显示虚假的测试交易数；候选 2 的测试指标和基线测试收益可见。

## 验证与未关闭门禁

`strategy-experiment-detail.model.test.ts` 定向 5 项通过；受影响文件 ESLint、Prettier 通过；Desktop `pnpm --filter @thesis-ledger/desktop build` 通过。目标 Vite 页面重新加载后核对上述候选状态，Server API 独立核对实验、候选及全部 8 个 Run 引用、状态和引擎版本。

当前 Server 的模型提示词构造调用 `optimizationModelMetrics`，该投影只遍历 `development` 与 `validation`，先以封闭 Schema 过滤字段再形成基线和历史候选反馈。`strategy-optimization-model-feedback.test.ts` 当前 4 项通过，覆盖旧式和 SDK 提示词的封存收益、日期、事件、行情、诊断哨兵排除。此为源码及定向测试证据；本次真实 LMStudio 传输请求体未另行捕获，故不把它提升为真实请求逐字节审计。

本记录证明一条真实模型成功路径、一次封存测试和 8 个 Run 的冻结重放，不证明模型格式失败分类或模型真实请求体的逐字节审计，也不覆盖 M2/M3、严格历史时点或 AC14 总验收。`G-AI-selection-visibility` 可关闭，`G-AI` 保持开放。
