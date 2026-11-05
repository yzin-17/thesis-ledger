import { BadRequestException } from '@nestjs/common';
import { AiExecutionTimeoutError } from './timeout/ai-timeout-scope.js';

export function validationInterruption(signal: AbortSignal, deadline: number) {
  if (signal.aborted) {
    if (
      signal.reason instanceof AiExecutionTimeoutError ||
      (signal.reason instanceof Error && signal.reason.name === 'TimeoutError')
    )
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
    return '验证已耗尽本次计划的执行预算，已进入收尾，原配置未修改';
  return '生成请求已取消，原配置未修改';
}

export function assertValidationActive(signal: AbortSignal, deadline: number) {
  const interruption = validationInterruption(signal, deadline);
  if (interruption) throw new BadRequestException(validationInterruptionMessage(interruption));
}
