import { useLayoutEffect, useRef } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { requestFailureMessage } from '@/shared/api/request-error';

/** 提示属于当前实验页面生命周期，网络请求仍可独立完成并刷新事实。 */
export function useExperimentOperationFeedback() {
  const toast = useToastManager();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const activeScope = useRef(false);
  const errorToasts = useRef<Record<string, string>>({});
  const successToasts = useRef<Set<string>>(new Set());
  useLayoutEffect(() => {
    activeScope.current = true;
    return () => {
      activeScope.current = false;
      Object.values(errorToasts.current).forEach((id) => toastRef.current.close?.(id));
      successToasts.current.forEach((id) => toastRef.current.close?.(id));
      errorToasts.current = {};
      successToasts.current.clear();
    };
  }, []);
  const isCurrent = () => activeScope.current;
  const notifySuccess = (options: Parameters<typeof toast.add>[0]) => {
    if (isCurrent()) successToasts.current.add(toast.add(options));
  };
  const clearOperationError = (operation: string) => {
    const id = errorToasts.current[operation];
    if (id) toast.close?.(id);
    delete errorToasts.current[operation];
  };
  const reportOperationError = (operation: string, title: string, error: unknown) => {
    if (!isCurrent()) return;
    clearOperationError(operation);
    errorToasts.current[operation] = toast.add({
      title,
      description: requestFailureMessage(error, '请保留当前配置后重试'),
      type: 'error',
    });
  };
  return { notifySuccess, isCurrent, clearOperationError, reportOperationError };
}
