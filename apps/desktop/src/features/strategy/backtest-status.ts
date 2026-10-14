export const jobStatusLabel = (status: string, cancelRequestedAt?: string | null) => {
  if (status === 'running' && cancelRequestedAt) return '正在取消';
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[status] ?? `未知状态（${status}）`;
};

export const jobStatusVariant = (
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'succeeded') return 'secondary';
  if (status === 'failed') return 'destructive';
  if (status === 'running') return 'secondary';
  return 'outline';
};
