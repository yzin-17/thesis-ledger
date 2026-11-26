import { z } from 'zod';

export const strategyCompilationDiagnosticSchema = z.strictObject({
  stage: z.enum(['structure', 'compile', 'semantic', 'data-scope']),
  code: z.string().min(1), path: z.array(z.union([z.string(), z.number()])),
  message: z.string(), details: z.record(z.string(), z.unknown()).optional(),
});
/** 与原始回执分别保存；不是历史统计或策略事实的替代。 */
export const strategyCompilationSchema = z.strictObject({
  compilerVersion: z.literal('strategy-ast-compiler-v1'), rawFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(['compiled', 'rejected']), diagnostics: z.array(strategyCompilationDiagnosticSchema).max(100),
  definition: z.unknown().optional(), candidate: z.unknown().optional(), dependencies: z.array(z.unknown()),
});
