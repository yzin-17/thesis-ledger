import { renderToStaticMarkup } from 'react-dom/server';
import { Text } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { Action, Feedback, QueryList, QueryStatus } from '../src/components/MobilePrimitives';
import { getMobileTheme } from '../src/theme';

vi.mock('react-native', () => vi.importActual('react-native-web'));
vi.mock('../src/app/MobileRuntime', () => ({
  useMobileRuntime: () => ({ theme: getMobileTheme('light') }),
}));

const ready = { isError: false, error: null, isPending: false };
const retry = () => {};

describe('移动端加载反馈', () => {
  it('首次读取和已有空结果的刷新均显示一个圈，结束后显示空态', () => {
    for (const isPending of [true, false]) {
      const html = renderToStaticMarkup(
        <QueryStatus query={{ ...ready, isPending, isFetching: true }} retry={retry} empty />,
      );
      expect(html.match(/role="progressbar"/g)).toHaveLength(1);
      expect(html).not.toContain('当前范围暂无数据');
    }
    const empty = renderToStaticMarkup(<QueryStatus query={ready} retry={retry} empty />);
    expect(empty).toContain('当前范围暂无数据');
    expect(empty).not.toContain('role="progressbar"');
  });

  it('列表刷新保留当前行并且只有一个加载圈，追加分页单独反馈', () => {
    const query = { ...ready, data: ['原成交'], isFetching: true };
    const render = (isFetchingNextPage: boolean) => renderToStaticMarkup(
      <QueryList query={{ ...query, isFetchingNextPage }} retry={retry} label="正在刷新成交记录">
        <Text>原成交</Text>
      </QueryList>,
    );
    const refreshing = render(false);
    expect(refreshing).toContain('原成交');
    expect(refreshing).toContain('正在刷新成交记录');
    expect(refreshing.match(/role="progressbar"/g)).toHaveLength(1);
    expect(render(true)).toContain('原成交');
    expect(render(true)).not.toContain('role="progressbar"');
  });

  it('等待启用的查询没有加载圈，离线暂停保留原因', () => {
    const pending = { ...ready, isPending: true };
    const idle = renderToStaticMarkup(<QueryStatus query={{ ...pending, fetchStatus: 'idle' }} retry={retry} />);
    const paused = renderToStaticMarkup(<QueryStatus query={{ ...pending, fetchStatus: 'paused' }} retry={retry} />);
    expect(idle).toBe('');
    expect(paused).toContain('当前离线');
    expect(paused).not.toContain('role="progressbar"');
  });

  it('只有正在执行的操作显示加载圈，已有提示仍可读', () => {
    const blocked = renderToStaticMarkup(<Action label="保存" disabled onPress={retry} />);
    const saving = renderToStaticMarkup(<Action label="保存" busy onPress={retry} />);
    const feedback = renderToStaticMarkup(<Feedback busy message="已保留输入" />);
    expect(blocked).not.toContain('role="progressbar"');
    expect(saving).toContain('role="progressbar"');
    expect(saving).toContain('aria-busy="true"');
    expect(feedback).toContain('role="progressbar"');
    expect(feedback).toContain('已保留输入');
  });
});
