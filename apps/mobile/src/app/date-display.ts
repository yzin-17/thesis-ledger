/** 业务时间展示统一指定时区；原始冻结文本在证据区继续保留。 */
export function formatMobileDateTime(value: unknown, timeZone = 'Asia/Shanghai') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
