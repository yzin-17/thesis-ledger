# 新增分钟周期与盘中日线实源验收

对应[图表任务](../archive/tasks/2026-11-04-market-chart-followups.md)。实际观察日期：北京时间2026-11-05。配置和来源授权复用用户先前批准的四条富途分钟路由、一条Yahoo ETF日线路由及20／8整窗、0 USD新增费用边界。

## 来源结果

富途继续使用保存的host.docker.internal:11111。首次OpenD不可达请求503；用户确认恢复后TCP可达，重新读取成功。13份bars响应覆盖四个固定标的的15m／30m／60m及00700.HK的5m，各20点、时间严格递增、baseSources明确futu。港股午休末桶observedEndAt为12:00，未跨午休拼接；美股末点对应11-04 16:00 EST，UTC为21:00，时标与夏令时结束后的市场时间一致。

四个标的的5m MACD均通过现行Server入口读取真实1m整窗、聚合、预热、DSA provided-points计算，分别返回20个有值点。指标响应保存计算输入范围、点数和指纹，本身不携带Provider回执，因此不把它们计作带来源证明的bars响应。来源绑定和计算链路另由目标代码一致性及定向合同证明。

组合detail尝试因目标目录没有该证券身份而400，发生在来源读取前；此失败保持，不以显式assetType的bars成功冒充目录身份就绪。后续实源使用接受显式身份的bars／indicators正式入口，不创建Asset或修改财务数据。

Yahoo的AAPL与SPY各有两份11-04盘中incomplete日线，间隔228.087／228.171秒，close和volume确有变化。原收盘观察进程未在计划05:05留下回执，实际于12:55补读，11-04日线均为complete；这证明盘中至收盘后转换，不能称为05:05准时观察或盘中历史快照重建。

## 预算、配置与合同

保守占用富途19/20、Yahoo6/8；失败请求同样保留占用，不将指标成功改写为带行情来源证明的回执，不自动重发。19份成功bars及4份成功指标均经当前packages/schemas/dist共享合同解析。未新增模型调用。

临时路由的写入修订185，Yahoo单条恢复修订186，富途四条恢复修订187。恢复均读取最新修订，仅删除仍与本轮原添加条目完全相同的路由；applied、effectiveStale=false，其他当前路由保留。Provider保存配置、凭据及前端额外参数未改动。

本地原件目录为`.recovery-artifacts/todo-4-15-delivery-20261104/`：real-source-budget.json、real-*.json、real-source-typescript-validation.json、minute-real-matrix-summary.json及两份temporary-route-restoration.json。原件被忽略，不把真实价格、账户材料或完整日志新增到Git。

这份证据仅持有实源、计数、时间与配置恢复。定向／包测试、目标部署、实际页面交互、任务最终验收仍由对应子任务分别登记。
