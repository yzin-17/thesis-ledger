import { useEffect, useState } from 'react';

/**
 * 筛选类输入的统一防抖时长。
 * 全站只保留一个值：此前 strategy 用 300ms、agent 研究台用 250ms，用户感知不到差别，
 * 但维护时会有两套行为，故收敛为单一定义。
 */
export const FILTER_DEBOUNCE_MS = 300;

/**
 * 把频繁变化的值延迟到停止变化后再输出，用于「输入即查询」的文本筛选。
 *
 * 只负责时序，不负责语义：调用方仍需决定延迟后的值如何进入 queryKey 或 URL。
 * 首次渲染直接返回初始值，不会产生一次额外的空查询。
 */
export function useDebouncedValue<T>(value: T, delay: number = FILTER_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
