import { BadRequestException } from '@nestjs/common';
import { VALIDATION_DURATION_SECONDS } from './ai-provider-validation-policy.js';

export function validationInterruption(signal: AbortSignal, deadline: number) {
  if (signal.aborted) {
    if (signal.reason instanceof Error && signal.reason.name === 'TimeoutError')
      return 'operation_timeout';
    return 'validation_cancelled';
  }
  if (Date.now() >= deadline) return 'operation_timeout';
  return undefined;
}

export function validationInterruptionMessage(
  interruption: NonNullable<ReturnType<typeof validationInterruption>>,
) {
  if (interruption === 'operation_timeout')
    return `验证超过 ${VALIDATION_DURATION_SECONDS} 秒操作总期限，已按超时中断，原配置未修改`;
  return '生成请求已取消，原配置未修改';
}

export function assertValidationActive(signal: AbortSignal, deadline: number) {
  const interruption = validationInterruption(signal, deadline);
  if (interruption) throw new BadRequestException(validationInterruptionMessage(interruption));
}
