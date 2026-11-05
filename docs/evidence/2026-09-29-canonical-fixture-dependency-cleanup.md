# 回测依赖 fixture 直接使用当前端点

## 变更

- 删除 DSA 中无生产消费者的 V2 回测能力汇总及其 V2 Policy/raw 日线探测；当前 Calendar 与 Instrument Facts 端点的测试模式直接读取小范围 CN fixture。真实模式继续使用原有来源和覆盖拒绝。
- CN Instrument Facts fixture 的 `availableAt` 早于测试决策时间；保留必要的交易规则字段，不再生成无调用者的 HK/US、FX、NAV 和公司行动汇总。

## 验证

- 当前回测依赖、专属数据合同和 Control 定向 44 项通过；API `flake8` 通过。DSA 离线全包复核中。
- 目标 Docker 与真实历史 Calendar/Instrument Facts 仍未验收；原 M1/M2/M3 和 AC01–AC20 保持未完成。
