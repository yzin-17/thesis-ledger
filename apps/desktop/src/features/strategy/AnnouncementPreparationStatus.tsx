import type { MarketAnnouncementPreparation } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AnnouncementPreparationStatus({ result }: { result: {
  status: string; announcementPreparation?: MarketAnnouncementPreparation | undefined;
} | undefined }) {
  if (!result || result.status === 'blocked' || !result.announcementPreparation) return null;
  const progress = result.announcementPreparation;
  if (result.status === 'prepared' && !progress.errors.length && !progress.failed) return null;
  return (
    <Alert aria-live="polite">
      <AlertTitle>{progress.status === 'preparing' ? '正在自动准备公告资料' : '公告资料准备结果'}</AlertTitle>
      <AlertDescription>
        <p>已完成 {progress.completed} / {progress.total} 个证券月份，收录 {progress.matched} 份公告，下载 {progress.downloaded} 份，解析 {progress.parsed} 份。</p>
        {progress.errors.map((error, index) => <p key={index}>{error.reason}</p>)}
        {!!progress.failed && <p>{progress.failed} 个区间获取失败，保留已有资料，缺失状态按本次研究模型处理。</p>}
      </AlertDescription>
    </Alert>
  );
}
