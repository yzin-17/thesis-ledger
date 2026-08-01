# Phase 0 一致性 Review

## Review 范围

本次 Review 对照 `docs/spec.md`、`docs/specs/stock-investment-os-spec-v3.md`、ADR-001～ADR-008、`docs/domain-model.md`、`docker-compose.yml`、DSA Fork、行情/Portfolio/Risk/Notification/AI/筹码能力审计和 V1 发布任务清单执行。审计基线为 DSA Fork 提交 `831ada5370123551e5cb4fc099208dd70e892e22`。

## 架构职责矩阵

| 领域                        | 唯一拥有者                                         | DSA/外部系统角色                        | 结论                                                               |
| --------------------------- | -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Account / Ledger / Position | Investment OS Server + PostgreSQL                  | 不写入、不提供事实源                    | 通过 ADR-003、domain model 和 Server API 一致                      |
| Market / Kline / Provider   | Investment OS Contract + `services/dsa-adapter`    | DSA Fork 提供可替换行情能力             | 客户端只访问 Investment OS，Provider 保留 source/stale/dataQuality |
| Portfolio / Performance     | Investment OS Ledger 投影与快照                    | DSA Portfolio 仅作迁移/能力审计样例     | 不把 DSA 账户或快照当作资产事实                                    |
| Risk / Rule Engine          | Investment OS Risk Service                         | DSA Risk 可作为计算参考，不写 RiskEvent | 规则、阈值、事件和审计由主仓拥有                                   |
| Chip / Quant                | Investment OS Quant Contract                       | DSA/其他 Provider 提供估算与原始字段    | 结果必须带 provider、时间和缺失语义，不代表真实账户成本            |
| AI / Tool / Provenance      | Investment OS AI Gateway、Permission、Decision Log | DSA Agent/ToolSurface 是可替换 Worker   | Portfolio Tool 需薄适配到 Investment OS，禁止直接读 DSA Portfolio  |
| Notification                | Investment OS Notification、Delivery、Audit        | DSA Feishu 代码可复用为 Provider 参考   | 去重、冷却、策略和审计由主仓拥有                                   |
| Desktop / Mobile            | 仅调用 Investment OS API                           | 不直连 DSA 或模型 SDK                   | ADR-008、客户端源码和任务验收一致                                  |

## 一致性检查结果

- [x] Spec 和 ADR 都声明 Ledger 是唯一资产事实源，未发现把 DSA 作为资产事实源的有效描述。
- [x] Compose 只给 DSA `expose: 8000`，Server 通过 `DSA_BASE_URL` 访问；客户端没有 DSA 直连入口。
- [x] Fork 的 `origin/upstream`、固定提交、镜像标签和能力审计相互对应；主仓 Adapter 与 Fork 目录职责没有混淆。
- [x] Market、Portfolio/Risk、Notification、AI/Tool、Chip 审计都记录了可复用能力和不能复用的边界。
- [x] V1 发布清单仍把真实设备、安装包、生产签名、E2E 和发布 tag 作为后续门禁，没有把本次 Phase 0 审计误报成发布完成。

## 未决项与责任归属

| 未决项                                                       | Owner           | 后续任务                      |
| ------------------------------------------------------------ | --------------- | ----------------------------- |
| Investment OS Portfolio Tool → DSA ToolSurface Contract Test | AI/Adapter      | T016 后续 Contract Test、T280 |
| 可用 Provider 下的真实筹码原始样本                           | Quant/Adapter   | T017 后续 benchmark、T282     |
| Desktop 安装包与签名入口                                     | Desktop/Release | T272、T294                    |
| Android/iOS release 与设备验收                               | Mobile/Release  | T065、T066、T274、T275、T284  |
| Desktop/Mobile 状态注入、响应式、可访问性和 UI E2E           | Client QA       | T276～T278、T283、T284        |
| Fork delta 与 upstream 同步演练                              | DSA/Adapter     | T288、T289                    |

## 验证证据

本次 Review 使用以下只读检查作为证据：

```text
rg -n "事实源.*DSA|DSA.*事实源" docs apps packages services infra README.md
docker compose config -q
git -C third_party/daily_stock_analysis diff --check
git -C third_party/daily_stock_analysis status --short
```

静态搜索仅保留“DSA 不是事实源”或能力边界语义；Compose 配置可解析，Fork 工作树无未提交修改。Phase 0 一致性条件通过，T018 可以勾选；上表未决项已由后续任务承接。
