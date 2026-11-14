# 开发库不备份升级验证

对应[规格](../specs/2026-11-12-development-upgrade-without-backup.md)及[任务](../tasks/2026-11-12-development-upgrade-without-backup.md)。用户在本线程明确“不需要备份”，此后不再沿用此前待批准的备份方案。默认升级仍保留备份，受限例外由显式参数选择。

最新状态：不备份分支本地与隔离验证通过，真实目标执行尚未发生。并行默认升级已完成原迁移且回执含备份；本线程未重复备份或迁移。缓存target模式与最终四宽页面通过，详见[目标验收](2026-11-12-market-base-result-cache-completion.md#最终目标运行态与消费验收)。本Task只保留B4实际执行缺口。

## 实现与审查

应用新增database-upgrade-no-backup.ts，复用原升级计划、事务生成、隔离库和数据摘要模块；prepare入口按显式选项准备结构演练和摘要，提交后由同一正式流程核验。infra仅增加参数校验、阶段透传及事务后的应用核验，不复制业务SQL或修改主备路由。

审查确认：仅thesis-ledger-dev/thesis_ledger及owner thesis_ledger；仅一项待迁移，原始SQL摘要必须匹配，并限定为JSONB非空空对象默认值及对象约束增列。未知head、多个／空迁移、其他SQL、权限或源码变化均拒绝。既有目标、head、事务、锁、消费者停止及完整结构门禁保留；核验失败不会进入startUpdated。源码未生成源业务备份或恢复副本，空结构演练不认证真实业务副本。

用户本次允许的迁移为20261112020000_optimization_manual_retry，SHA256=`766a5bcc1161b4e8fff5009d528043558c84f6bd9a659aba9172661a77988176`。旧业务列通过行摘要核对，不输出记录、凭证或明文配置。

## 本地与隔离验证

- 应用资格八项，加原SQL／演练合同共19项通过。平台包首次142通过、1失败：既有迁移计划测试的固定清单漏了最新Arena和手动重试两项；补齐实际迁移链后143项通过。失败与通过JSON分别保存在主仓忽略目录cache-completion-20261112/platform-no-backup.json及platform-no-backup-fixed.json。
- Server类型、build、定向ESLint及主仓边界通过。未运行真实来源接口。
- infra定向六项通过，覆盖默认流程、错误参数在停止前拒绝、提交后核验及失败不启动消费者；完整96通过、1按既有条件跳过，check门禁通过。
- E11_NO_BACKUP_UPGRADE=1的实际隔离PostgreSQL验证通过：空结构演练、含数据旧列保持、空对象默认、对象约束拒绝、事务错误回滚、错误head／权限摘要／旧数据变化拒绝。初轮入口导入注册了八项普通测试，随后提取fixture后单独真实集成1项通过，3.76秒。没有复制源业务数据或调用备份器。
- 隔离容器通过现有createUpgradeIsolation生成并核对随机标签清理；最终该标签容器为空。未操作真实Redis、业务行或其他项目容器。

## 正式目标状态

在infra执行正式./scripts/update.sh thesis-ledger，使用Node24及DEV_DATABASE_MODE=upgrade、精确目标确认、显式不备份和上述迁移摘要。单次尝试退出1，日志为主仓忽略目录cache-completion-20261112/formal-no-backup-update.log。原因是已有更新锁，未进入本次构建、消费者停止或迁移，不是备份授权缺失。

锁目录为thesis-ledger-update-501-2842842147.lock，持有PID24926自北京时间13:34:09运行，仍有docker／buildx子进程；BuildKit记录35460gre4itn3ty48dqvrbjgc处于running。只读核对其已有build.log显示Alpine编译依赖安装，未终止、删锁或启动并发更新。当前Server与Worker仍健康，启动代次保持04:55Z；本次无备份文件和真实迁移。

## 消费面独立进展

维护入口market-bar-cache-target-browser.mjs打开实际Desktop自选页，使用现有5173进程，目录及行情响应受控；3000仅为Server API，不是Desktop站点，前两次定位失败及第三次404截图保留，未据此判定业务页面故障。校正为实际Desktop后，1440／1024／768／390四宽均通过：刷新、单图区加载圈、保留原图、失败文案、恢复、关闭重开、弹窗边界和无页面横向溢出。

成功回执位于cache-completion-20261112/target-browser-precheck-04/report.json，完成于05:51:32.547Z，浏览器业务写入0、供应商价格调用0。另32个不属于验收的行情读取在浏览器拦截，不称为这些接口已成功。人工查看390失败截图，失败原因与原图均可见。此处验证实际页面及受控请求，Server目标缓存模块仍须正式更新后以target模式独立验收；C6不提前勾选。

## 剩余项

第二次正式入口同样被另一活动锁拒绝，日志formal-no-backup-update-02.log，没有进入构建或停止消费者。第三次准备先查询实际head，确认原迁移已由并行正式默认流程完成，选择复用已对账运行态，不再调用升级。其.database-upgrades/run.JDh3jD包含backup.dump、rehearsal.json及事务成功日志，因此不能将该次结果称为用户选择后的不备份模式实测；备份属于并行流程，未删除或重复创建。

缓存target模式及最终实际Desktop四宽均通过，B5完成。不备份分支的B4真实目标执行仍未取得，原目标已无该待迁移，当前没有安全且必要的补验操作。该叶继续活动，仅在未来存在合法、符合范围且已授权的真实迁移时接续；不制造迁移、倒退结构或把副本演练当作目标实测。没有新增价格请求或业务写入。
