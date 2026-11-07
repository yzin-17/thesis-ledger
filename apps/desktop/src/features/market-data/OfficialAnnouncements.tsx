import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketInformationClient } from '@thesis-ledger/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parsedDesktopRequest } from '../shared/request.js';

export function OfficialAnnouncements() {
  const [q, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['desktop', 'market-data', 'announcements', q, page],
    queryFn: ({ signal }) =>
      marketInformationClient(parsedDesktopRequest()).getAnnouncements(
        { q, page, pageSize: 50 },
        signal,
      ),
    retry: false,
  });
  const data = query.data;
  return (
    <>
      <Input
        aria-label="搜索公告标题或标的"
        placeholder="搜索公告标题或证券代码"
        value={q}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      {query.isPending && (
        <LoadingState label="正在加载公告" />
      )}
      {query.isError && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-muted-foreground">
            {data ? '公告刷新失败，当前保留上次成功读取的结果。' : '公告列表加载失败。'}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {data && (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {q.trim() ? '匹配' : '共收录'} {data.total} 份原文，当前显示 {data.items.length} 份
          </p>
          <ListRefreshRegion refreshing={query.isRefetching} label="正在刷新公告">
            <ul className="divide-y divide-border" aria-label="已收录公告与规则文档">
              {data.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 py-3 first:pt-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm text-sm font-medium text-primary hover:text-primary/80 wrap-anywhere"
                  >
                    {item.title}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    发布日期：{item.publishedDate} · {item.symbol}
                  </p>
                  <p className="text-xs">
                    {item.uses.map((use) => (use === 'risk' ? '风险警示' : '停复牌')).join('、')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    原文：{downloadLabel(item.downloadState)} · 状态解析：
                    {parseLabel(item.parseState)}
                  </p>
                  {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                </li>
              ))}
            </ul>
          </ListRefreshRegion>
          {data.total === 0 && (
            <p className="text-sm text-muted-foreground">
              {q ? '没有匹配的公告或规则文档。' : '当前尚未收录公告。'}
            </p>
          )}
          {data.total > 50 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span className="text-xs text-muted-foreground">第 {page} 页</span>
              <Button
                variant="outline"
                disabled={page * 50 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function downloadLabel(value: 'pending' | 'downloaded' | 'failed') {
  if (value === 'downloaded') return '已下载';
  if (value === 'failed') return '下载失败';
  return '未下载';
}
function parseLabel(value: 'unparsed' | 'parsed' | 'failed') {
  if (value === 'parsed') return '已解析';
  if (value === 'failed') return '解析失败';
  return '未解析';
}
