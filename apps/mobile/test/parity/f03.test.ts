import { describe, expect, it } from 'vitest';
import { assertWritable, valuationLoadState } from '../../src/app/query/query-state';
describe('手机 Query 状态与可写边界', () => {
  it('旧成功数据不能掩盖最新读取失败或刷新中的状态', () => {
    const data = { positions: [] };
    expect(valuationLoadState({ data: data as never, isError: true, isPending: false })).toBe(
      'error',
    );
    expect(() => assertWritable({ data, isError: true, isFetching: false })).toThrow();
    expect(() => assertWritable({ data, isError: false, isFetching: true })).toThrow();
    expect(() => assertWritable({ data, isError: false, isFetching: false })).not.toThrow();
  });
});
