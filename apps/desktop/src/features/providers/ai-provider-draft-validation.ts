import { aiProviderDraftError, type AiProviderInput } from './ai-provider.actions.js';

type DraftValidationToast = {
  add: (message: {
    title: string;
    description: string;
    type: 'error';
    timeout: number;
    priority: 'high';
  }) => unknown;
};

/** 先构建并校验草稿，坏JSON与普通字段错误共用保存／测试入口的错误反馈。 */
export function validatedAiProviderInput<T extends AiProviderInput>(
  build: () => T,
  toastManager: DraftValidationToast,
): T | null {
  try {
    const input = build();
    const error = aiProviderDraftError(input);
    if (error) throw new Error(error);
    return input;
  } catch (error) {
    toastManager.add({
      title: 'AI Provider 配置不完整',
      description: error instanceof Error ? error.message : '请检查配置字段',
      type: 'error',
      timeout: 7000,
      priority: 'high',
    });
    return null;
  }
}
