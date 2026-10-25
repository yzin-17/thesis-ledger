import { useRef } from 'react';
import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { useMobileRuntime } from '../../app/MobileRuntime';

export function configurationFailure(error: unknown): string {
  if (error instanceof ThesisLedgerContractError) return '返回数据与当前操作不一致，请重新读取。';
  if (error instanceof ThesisLedgerApiError) {
    if (error.status === 409) return '配置或引用已改变，请重新读取后再提交。';
    if (error.status === 403) return '当前操作未获授权，请核对权限和预算。';
    if (error.status === 400 || error.status === 422) return '输入未通过服务端检查，请核对字段。';
    return `服务暂时无法完成操作（${error.status}），请重新读取状态。`;
  }
  if (error instanceof Error && error.name === 'AbortError')
    return '已取消等待，请重新读取服务端状态。';
  if (error instanceof Error && error.name === 'ZodError')
    return '输入不符合当前合同，请核对字段、模型、路由和修订。';
  return '操作未完成，请检查输入和连接后手动重试。';
}
// 凭证不进入 Mutation variables、Query key 或持久化；错误也不保留原始响应。
export function useConfigCommand() {
  const { scope } = useMobileRuntime();
  const client = useQueryClient();
  const action = useRef<(() => Promise<unknown>) | null>(null);
  const pending = useRef<Promise<unknown> | null>(null);
  const mutation = useMutation({
    mutationKey: ['mobile-write', ...scope, 'configuration'],
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    mutationFn: async () => {
      const execute = action.current;
      action.current = null;
      if (!execute || !onlineManager.isOnline()) throw new Error('当前离线，请联网后手动提交。');
      try {
        return await execute();
      } catch (error) {
        throw new Error(configurationFailure(error));
      }
    },
  });
  const submit = <T>(execute: () => Promise<T>): Promise<T> => {
    if (pending.current) return pending.current as Promise<T>;
    action.current = execute;
    const operation = mutation
      .mutateAsync()
      .then(async (result) => {
        await client.invalidateQueries({ queryKey: [...scope, 'configuration'] });
        return result as T;
      })
      .finally(() => {
        pending.current = null;
        action.current = null;
        mutation.reset();
      });
    pending.current = operation;
    return operation;
  };
  return { submit, pending: mutation.isPending };
}
