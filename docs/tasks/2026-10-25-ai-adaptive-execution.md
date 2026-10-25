# AI 自适应超时与重试实施任务

对应[规格 AE1～AE7](../specs/2026-10-25-ai-adaptive-execution.md)。

> 当前状态（2026-10-26）：T1～T4本地交付通过：109项测试、类型检查、宿主build、隔离Redis／Nest注入、边界、定向lint／复杂度及文档检查通过。D35已将新代码固化到目标镜像，双角色／实际Schema及capabilities核对；唯一正式请求实际三项超时299935ms／SDK重试0，约2.6秒收到OpenRouter HTTP404，未获得模型正文。T5真实成功输出未通过；同镜像关闭重建后trace保持，V2关闭、无策略／pending=0、五服务健康，本次1/1、余3次冻结。默认配置／原22表旧行／trace及三仓WIP保留，不stage／commit。工程历史见[本地回执](evidence/2026-10-25-ai-adaptive-execution.md)，现行运行结果见[D35回执](evidence/2026-10-25-g3-adaptive-runtime-acceptance.md)。

## 执行叶

- [x] T1：交付可审查的等待预算与重试策略。
  - 覆盖：AE1～AE5；依赖：现有 `AiResearchPolicyV1`／timeout source／单次 adapter 合同。
  - 输入：`ai-provider-readiness.ts`、`ai-research-sdk-reservation.ts`、`ai-sdk-generation-facts.ts`、本 Spec。
  - 写集：新增 AI 领域策略、观测类型和定向测试；不改业务 Schema 或默认配置。
  - 完成：冷启动／学习／截尾／显式覆盖与拒绝分类可离线证明，配额及期限不会扩大授权；测试通过。
- [x] T2：交付有限、共享且可降级的运行观测缓存。
  - 覆盖：AE2、AE3、AE5、AE6；依赖：T1 的观测及配额接口。
  - 写集：AI Redis adapter、定向测试、infra `verify-ai-adaptive-cache.mjs` 与安全约束测试；不改平台 Redis 配置或部署依赖。
  - 完成：长度／TTL／校验／去重／原子配额／失败降级及多实例行为通过单元与隔离真实 Redis 合同测试；仅操作脚本自有无挂载容器。
- [x] T3：接入研究单路由执行及 trace。
  - 覆盖：AE1、AE3～AE7；依赖：T1／T2 接口通过。
  - 写集：`ai-research-sdk-execution.ts`、`ai-research-sdk-contract.ts` 的请求映射、语义清晰的结算／观测提取、adapter／trace 最小接线、`ai.module.ts`、本地 HTTP 集成测试与夹具及边界门禁。
  - 完成：每次尝试原子授权；明确拒绝仅同 Provider／模型重试，未知／内容错误即停；首输出／停顿动态决策可反读，原大文件不继续承载新增职责。
- [x] T4：完成源码集成检查与交付。
  - 覆盖：AE6、AE7；依赖：T1～T3。
  - 验证：定向策略／缓存／真实 SDK 本地 HTTP → Server 类型检查与 build → 边界、定向 lint、复杂度与文档检查；保存准确范围与结果。
  - 完成：本地实现、自审、保护基线及执行证据对账；更新 G3 入口，不宣称目标部署或真实模型已验。
- [ ] T5：目标运行态与真实 Provider 验收。
  - 覆盖：AE6、AE7 的部署面；依赖：T4及新的明确部署／真实调用授权。
  - 当前边界：用户要求“再次验证G3”后，新增单次验收由[G3-D35](2026-10-18-research-evidence-evolution.md)统一执行；默认路由／原推理，1/1已用，失败停止，余3次冻结。实际费用未知，不把上限0视为已核实费用。
  - 已验部署面：新镜像df411ebf…、Server／Worker与实际Schema／自适应模块一致；capabilities正常。真实SDK的cold_start样本0、首输出／空闲／总期限均299935ms、SDK maxRetries0，nativeFetches1；完整记录约2.6秒后的上游HTTP404，未超时／重试。
  - 已验收尾：同镜像正式关闭重建，双角色本次16份文件及D30原trace字节／权限／归属保持，V2=false／无策略／pending=0、五服务健康，原数据和配置保持。
  - 未通过范围：HTTP404正文为Nvidia Function对account不可找到，并含此前Nvidia500／502和Phala429路由错误；没有模型正文／成功报告，本次不能证明长等待后的完整输出与G3正向消费。实际模型／用量／费用未知，SDK对完整HTTP错误仍归transport_unknown的精度缺口保留；不得用本地替身代收。
  - 新接续：用户指出控制台未见请求并授权再试1次，现由G3-D36执行；本地核对目标凭据与控制台摘要一致，复用同一已验镜像，失败即停，实际派发后余2次冻结。D35事实保持，未执行前不预记通过。

## 最终一致性 Review

当前结论：本地交付及T5部署／实际决策／单次停止／关闭持久化子范围通过。AE1～AE7本地断言、109项受影响测试、2项入口约束、类型／构建、定向lint与复杂度零警告、边界及原94条文档链接证据复用；生产源码未变。目标真实请求提前收到上游HTTP404，没有覆盖完整模型输出，T5及原G3正向义务保持未完成，本次1/1、余3次冻结；无新增TODO或归档、无stage／commit。详细边界见[D35回执](evidence/2026-10-25-g3-adaptive-runtime-acceptance.md)，本地证据见[原回执](evidence/2026-10-25-ai-adaptive-execution.md)。
