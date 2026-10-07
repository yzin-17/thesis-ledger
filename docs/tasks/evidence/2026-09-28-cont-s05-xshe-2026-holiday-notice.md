# XSHE 2026 年休市通知固定原文解析

## 原文与边界

[深圳证券交易所 2026 年部分节假日休市通知](https://www.szse.cn/disclosure/notice/t20251222_618087.html)正文日期为 2025-12-22、文号为深证会〔2025〕481 号，明确七段休市区间及复市日。本轮从该官方 URI 有界保存 UTF-8 HTML 原字节，24,892 字节，SHA-256 `adfcdc1c285121a58ad3a55060a7125812d542cf9fdb92058aac1b1bc99c8243`；本机文件写入时刻为 `2026-09-28T04:09:10Z`。该时刻仅记录本次捕获，不证明页面在 2025-12-22 已被系统捕获，也不作为独立不可变历史归档根。原字节以 base64 保存在 `apps/server/test/market/fixtures/szse-2026-holiday-notice.raw.base64`，测试解码后重新核对长度与摘要。

Market 新 `market-pit-szse-holiday-notice-v1.ts` 仅接受固定 URI、发布主体、摘要和规范 base64。它从唯一正文容器提取七个假日名称、休市起止和复市日，核对正文署名、公告日期、星期、区间顺序及复市为下一工作日，再得到 19 个工作日休市日期。自报新摘要不能替代固定登记；解析结果刻意不含 `knownAvailableAt`、完整日历或 PIT 资格。当前没有生产调用方。

[深交所交易规则（2026 年修订）](https://docs.static.szse.cn/www/lawrules/rule/trade/current/W020260424690713155663.pdf)另载工作日和竞价时段，但本叶未固定该 PDF 原字节，也未从休市通知推断交易时段、临时停市或其历史有效区间。目标 159516.SZ 的持续 XSHE 场所、独立公告修订/历史捕获、完整日历及同期价格来源仍须分别核验。

## 验证

- 红例阶段：成功原文与篡改后自报摘要两项失败，其他拒绝断言运行；实现后新文件 13 passed。
- 本叶与相邻 XSHG 固定包解析、源码树、投影四文件：88 passed、1 skipped。跳过项为原有公开输入条件，不计本叶通过。
- `pnpm --filter @thesis-ledger/server typecheck`、两个新 TypeScript 文件 ESLint、Prettier 首次新文件失败后格式整理并唯一复试通过；格式后相邻测试和 lint 再通过。
- 带 `HEAD` 基线的文件尺寸 ratchet 通过，仍有 13 条存量警告；`git diff --check` 通过，触及源码/测试/原文 fixture 无尾随空白。

仅关闭固定年度休市通知的当前原文解析叶。没有真实 HiThink、目标容器、Worker、浏览器、完整 XSHE 日历投影、历史发布时点或严格 PIT 准入验收。
