# 当前 Data 能力与健康检查收敛

## 改动与语义

- DSA `/api/v3/thesis-ledger/capabilities` 只声明 `dataContractVersions: [3]`，并报告 `serviceCapabilities.fundNav: true`。该字段表示净值端点已安装，不证明单只基金的真实 Provider、来源覆盖或可用性。
- Server 健康检查改读现行 Data 能力合同，删除 DSA Client 的旧 V1 capabilities 方法。旧 `/api/v1/thesis-ledger/capabilities` 已从 DSA 移除；Schema 固定单一 Data 版本并去掉多版本去重逻辑。
- 精确行情选择器的能力读取现在必须由调用方提供；生产 `MarketBarWindowReaderV3` 明确调用 DSA 能力端点，选择器不再合成能力响应。

## 验证与边界

- Schemas 定向 10 项通过；全量首次因旧 Control/Data 独立性测试仍输入 `[2]` 失败，更新为当前 V3 输入后全量 563 项通过，构建通过。
- DSA 合同与 V3 行情定向 34 项通过，涉及文件 flake8 通过；官方离线全量 7596 项通过、1 项跳过、4 项未选。
- Server 健康、DSA 客户端、选择器和回测定向 42 项通过；选择器收紧后 12 项定向、类型检查及完整 Server 包级 1684 项通过且 81 项跳过。
- DSA Control 旧合同、Schema/领域存量 V1/V2、目标 Docker 和真实业务验收未完成，C03/E01/E04/D02/D03 保持未勾选。
