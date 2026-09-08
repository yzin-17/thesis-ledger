# 市场数据缓存与 Provider 路由交互实施任务

对应 Spec：[`../specs/2026-09-08-market-data-cache-and-provider-routing.md`](../specs/2026-09-08-market-data-cache-and-provider-routing.md)

## 任务

- [ ] T1：补齐四类市场数据的读穿缓存
  - 覆盖验收标准：AC1、AC2
  - 依赖：无
  - 涉及范围：MarketService、MarketBarCache、实时行情/基金净值历史/筹码摘要缓存策略与 Server 测试。
  - 完成条件：实时行情、日线 Bar、基金净值历史和筹码摘要具有明确的新鲜/最后有效缓存窗口；相同普通请求不重复访问 DSA；范围键、刷新和失败回退语义可验证。
  - 验证方式：Schema 契约测试、Server 市场服务测试、Prisma 生成/类型检查。

- [ ] T2：补齐 DSA Provider 完整清单与路由资格
  - 覆盖验收标准：AC3、AC5
  - 依赖：无
  - 涉及范围：DSA Provider manifest、Control Contract、Schema、DSA 文档与测试。
  - 完成条件：注册表包含 DSA 内置的 11 个 Provider；AKShare、efinance、Tencent 保持当前路由资格，其余 Provider 声明市场覆盖、配置方式且不会误入当前路由。
  - 验证方式：相关 pytest、Python 编译检查、Control/Data Contract 定向测试。

- [ ] T3：收敛 Provider 清单与市场数据页
  - 覆盖验收标准：AC3、AC4、AC6
  - 依赖：T2
  - 涉及范围：市场数据类型、TanStack Query、Provider 配置面板、路由策略面板、市场数据页、Market Detail 来源展示与 Desktop 测试。
  - 完成条件：Provider 清单完整展示 DSA 数据源、市场覆盖和路由资格；只有当前可路由 Provider 提供配置动作并进入主备下拉；市场数据页没有缓存状态入口或残留请求。
  - 验证方式：Desktop 组件测试、类型检查、构建、真实浏览器选择与布局检查。

- [ ] T4：完成跨仓回归与最终一致性 Review
  - 覆盖验收标准：AC7
  - 依赖：T1、T2、T3
  - 涉及范围：三仓目标测试、边界门禁、差异卫生、必要的本地运行时抽查与实施文档证据。
  - 完成条件：验证结果与 Spec/任务状态一致；失败或外部阻塞被明确记录，未通过项不勾选。
  - 验证方式：执行任务中记录的命令并逐项核对全部 AC。

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现
- [ ] 所有已勾选任务均有验证证据
- [ ] 所有任务依赖均已满足且无错误阻塞关系
- [ ] 跨任务接口、类型和命名保持一致（如适用）
- [ ] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [ ] 实现未超出 Spec 声明的范围
- [ ] 测试策略、测试实现与验证结果一致
- [ ] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；如已获提交授权，已形成合理 commit，否则已记录提交状态或建议边界
- [ ] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：待实施完成后复核。
- 发现的问题：无。
- 遗留风险：无。
- 验证命令与结果：待实施完成后填写。
