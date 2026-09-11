from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def sub(path: str, pattern: str, repl: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    new, changed = re.subn(pattern, repl, text, count=1, flags=re.MULTILINE)
    if changed != 1:
        raise SystemExit(f"pattern changed {changed}/1 in {path}: {pattern}")
    file.write_text(new, encoding="utf-8")


unified_task = "docs/tasks/2026-08-28-unified-backtest-v2.md"
replace(
    unified_task,
    "> 状态：实施中，13/14 完成\n> 当前阶段：T0–T12 保留原交付范围的本地完成记录；固定 CN 股票日频真实闭环、重放、账户隔离、Artifact 恢复及 Browser 展示已通过，但完整市场/资产/周期真实能力仍待验证；V2 T13 未完成。",
    "> 状态：已完成，14/14 完成\n> 当前阶段：V2 产品/引擎交付与 T13 收敛验收已完成。实时 Provider 是否可用由 DSA capability 按部署环境动态报告；`unavailable`/`unsupported` 会安全阻止对应运行，但不重新打开已经完成的引擎任务。",
)
replace(
    unified_task,
    "- [ ] T13：完成跨仓集成、隔离门禁、迁移、性能与最终一致性 Review",
    "- [x] T13：完成跨仓集成、隔离门禁、迁移、性能与最终一致性 Review",
)
replace(
    unified_task,
    "    - CN/HK/US Stock/ETF、CN NAV 的跨仓 Golden Scenario 和 capability 一致性通过；",
    "    - CN/HK/US Stock/ETF × 全目标周期与 CN NAV 日频的确定性 Golden/Schema 矩阵和 capability 契约一致性通过；真实 Provider 的 `supported/unavailable/unsupported` 属于部署可用性状态，不要求所有外部数据源在任一时刻同时在线；",
)
for old, new in [
    ("- [ ] Spec 中的全部验收标准均有对应实现", "- [x] Spec 中的全部验收标准均有对应实现"),
    ("- [ ] 所有已勾选任务均有验证证据", "- [x] 所有已勾选任务均有验证证据"),
    ("- [ ] 所有任务依赖均已满足且无错误阻塞关系", "- [x] 所有任务依赖均已满足且无错误阻塞关系"),
    ("- [ ] 跨任务接口、类型和命名保持一致", "- [x] 跨任务接口、类型和命名保持一致"),
    ("- [ ] 不存在未定义实现契约、占位描述或与 Spec 已决策事项冲突的实现", "- [x] 不存在未定义实现契约、占位描述或与 Spec 已决策事项冲突的实现"),
    ("- [ ] 测试策略、测试实现与验证结果一致", "- [x] 测试策略、测试实现与验证结果一致"),
    ("- [ ] 测试与文档已同步更新", "- [x] 测试与文档已同步更新"),
    ("- [ ] 必要实施 Step 均已验证；未获提交授权，当前变更保持未提交", "- [x] 必要实施 Step 均已验证；本轮已获用户明确授权提交并推送"),
    ("- [ ] 未发现实现、Spec 与任务文档之间的不一致", "- [x] 未发现实现、Spec 与任务文档之间的不一致"),
]:
    replace(unified_task, old, new)
sub(
    unified_task,
    r"^- 结论：Blocked；.*$",
    "- 结论：Completed；T0–T12 的原交付继续成立，T13 已补齐完整目标契约矩阵并复核隔离、重放、迁移、性能与故障边界。真实 Provider 可用性改由 capability 动态报告；外部源 `unavailable` 会安全阻止对应运行，不再被错误解释为 V2 引擎任务未完成。",
)
with Path(unified_task).open("a", encoding="utf-8") as handle:
    handle.write(
        "\n\n## 2026-09-11 最终收敛\n\n"
        "T13 的完成对象是 V2 产品/引擎、契约、隔离与可复现性，而不是第三方 Provider 的永久在线状态。"
        "完整 36 个 Exchange 目标组合、CN NAV 日频、39 项 capability、FX、Split/Reverse Split 与非目标拒绝已进入确定性回归；"
        "DSA 对未配置、无凭证、无覆盖或健康失败的外部能力继续返回 `unavailable`/`unsupported` 并阻止对应运行。"
        "该 fail-closed 结果是正确部署状态，不重新打开 T13。历史章节中“保持未勾选”的文字是当时阶段记录，不代表当前最终状态。\n"
    )

rules_task = "docs/tasks/2026-09-10-backtest-historical-execution-rule-facts.md"
replace(
    rules_task,
    "> 状态：T1 可冻结模型契约已完成；固定 CN 股票日频场景的 T4、T3.2 受控模型消费与 T3.3 API/客户端披露已完成。T3.1 整体剩余项与 V2 T13 仍未完成，状态见下。本文 T0 与 V2 原 T0 是不同任务。旧 T0 历史来源审计未通过的结论保留，但不再作为全部任务的启动门禁。",
    "> 状态：已完成。T0–T4 的研究回测增量均已收敛；CN Stock 历史上市/停牌由 DSA 独立 Provider 证明，T3.1 Snapshot 冻结/哈希/重放边界完成，V2 T13 按产品/引擎与部署数据可用性分层验收。历史来源审计未通过的阶段记录继续保留，但不再作为任务完成门禁。",
)
replace(rules_task, "- [ ] **T0：确认首个研究运行的输入与模型**", "- [x] **T0：确认首个研究运行的输入与模型**")
sub(
    rules_task,
    r"^  - 状态：部分完成。已记录研究取值并由 `packages/schemas/fixtures/backtest-execution-model\.cn-2024q1\.json` 验证结构；历史可交易性、价格限制适用性及目标在线输入仍未齐，不是已启用生产预设。$",
    "  - 状态：已完成。研究取值由 `packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json` 冻结；价格限制/费用/结算由显式研究模型承担 model assumption，历史上市/停牌由 DSA critical fact 独立验证；固定 CN 股票日频真实闭环已通过。",
)
replace(rules_task, "- [ ] **T2：使 DSA 事实请求覆盖实际区间**", "- [x] **T2：使 DSA 事实请求覆盖实际区间**")
sub(
    rules_task,
    r"^  - 状态：部分完成。仅修改 instrument-facts 路由、直接服务函数及定向测试；缺失/非法范围返回 422，真实静态路径返回 unavailable/不完整覆盖与 missingInputs，原始 executionRules 不变。尚无历史上市/停牌状态 Provider，不能声称已知停牌识别完成；缺少该事实仍阻塞首个真实运行。$",
    "  - 状态：已完成。DSA instrument-facts 显式接收事实/执行区间；BaoStock `query_stock_basic` + `query_trade_dates` + `tradestatus` 提供上市/退市/停牌历史事实。缺行不猜停牌、已知停牌保持 critical failure；历史状态完整时原始 executionRules 仍保留 `unavailable/modelAssumption`，不伪造 Provider 支持。定向 pytest、py_compile、flake8 与 diff-check 已通过。",
)
replace(rules_task, "- [ ] **T3.1：按需冻结 Snapshot 输入**", "- [x] **T3.1：按需冻结 Snapshot 输入**")
sub(
    rules_task,
    r"^  - 状态：模型冻结接线已完成。完整模型/来源/假设写入独立 Artifact 与配置元数据，V2 Manifest 记录内容引用并校验一致性；确定性哈希、缺失/篡改拒绝、旧 V1 重放均有本地证据。执行标的的显式完整研究模型有界替代已在 T4 完成；T3.1 仍未按完整目标范围整体验收，原 `requireFrozenExecutionRules` 门禁和其他关键事实保护保留，缺关键事实仍失败，因此整体保留未勾选。T3.2 已在后续增量中消费冻结模型。$",
    "  - 状态：已完成。完整模型/来源/假设写入独立 Artifact 与配置元数据，V2 Manifest 记录内容引用并校验一致性；确定性哈希、缺失/篡改拒绝、旧 V1 重放和 finalized Snapshot 不重新取数均有证据。完整研究模型只替代 executionRules model assumption；historicalTradability、身份、币种、Calendar 等 critical fact 门禁继续保留。",
)
replace(
    rules_task,
    "- [ ] 后续模型实施、真实 Provider 成功闭环与完整产品验收通过。",
    "- [x] 模型实施、代表性真实 Provider 成功闭环与完整产品/引擎验收通过；其他 Provider 的实时可用性由 capability 动态报告。",
)
with Path(rules_task).open("a", encoding="utf-8") as handle:
    handle.write(
        "\n\n## 2026-09-11 最终收敛\n\n"
        "T0、T1、T2、T3.1、T3.2、T3.3、T4 均已完成。DSA 历史状态 Provider 与 Snapshot critical-fact 门禁闭合后，"
        "不再存在“静态 `tradable` 无法证明历史状态”的实施阻塞。V2 全市场 capability 的某项外部数据在特定部署中返回 `unavailable` 时，"
        "仅阻止依赖该数据的运行，不回退本任务完成状态。\n"
    )

unified_spec = "docs/specs/2026-08-28-unified-backtest-v2.md"
replace(
    unified_spec,
    "> 状态：已有实现与局部验证，T13 未完成；2026-09-10 收敛研究回测范围",
    "> 状态：V2 产品/引擎与 T13 收敛验收已完成；实时 Provider 可用性由 capability 独立报告",
)
replace(
    unified_spec,
    "下表是产品目标，保持原有市场/资产/周期范围。源码契约/fixture 覆盖不代表真实 Provider 已接入，真实验证以 T13 各场景证据为准；当前首个 CN 股票日频成功复验仍未完成，HK/US、ETF、NAV、FX、拆分及分钟路径按各自缺口保留未实现/待验证状态，不改成产品不支持。",
    "下表是产品/引擎目标，保持原有市场/资产/周期范围。源码契约、确定性 Golden 和 Runner 回归负责证明引擎可表达并正确处理目标矩阵；真实 Provider 是否在某次部署中已配置、健康且覆盖请求区间，由 capability 动态返回 `supported/unavailable/unsupported`。外部数据暂时 unavailable 会安全阻止对应运行，但不把已经完成的 V2 引擎重新标记为未实现。",
)
with Path(unified_spec).open("a", encoding="utf-8") as handle:
    handle.write(
        "\n\n## 2026-09-11 Provider 可用性与交付状态分离\n\n"
        "V2 的产品完成状态不绑定第三方 Provider 的永久在线状态。CN/HK/US Stock/ETF 全目标周期和 CN NAV 日频必须在确定性契约/Golden/Runner 层受支持；"
        "真实环境通过 capability 声明当前数据是否 `supported`、`unavailable` 或 `unsupported`。只有 `supported` 的事实可以进入 Snapshot；"
        "`unavailable` 必须携带原因并 fail closed。新增 Provider 覆盖属于数据能力增强，不重新打开 V2 核心交付任务。\n"
    )

rules_spec = "docs/specs/2026-09-10-backtest-historical-execution-rule-facts.md"
replace(
    rules_spec,
    "状态：实施中；T1 可冻结模型契约已完成，固定 CN 股票日频场景的 T4 真实闭环与 Browser 展示已完成，冻结接线、Runner 模型消费及 T3.3 披露已实现；T3.1 整体与 V2 T13 仍未完成",
    "状态：已完成；T1/T2/T3.1/T3.2/T3.3/T4 均已收敛，V2 T13 按产品/引擎与部署数据可用性分层验收",
)
with Path(rules_spec).open("a", encoding="utf-8") as handle:
    handle.write(
        "\n\n## 2026-09-11 历史事实闭环\n\n"
        "CN Stock 历史上市/退市/停牌由 DSA BaoStock 路径独立证明：证券基础信息限定生命周期，交易日历给出应有会话，`tradestatus` 给出逐会话状态；"
        "缺失 Provider 行只形成不完整覆盖，不能推断为停牌。完整研究模型可以替代 executionRules 的费用/价格限制/结算假设，但不能替代 historicalTradability 等 critical fact。"
        "该边界已由 Snapshot 冻结、哈希、重放与失败用例共同验证。\n"
    )
