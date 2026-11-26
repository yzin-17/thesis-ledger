import { BadRequestException } from '@nestjs/common';
import {
  compileStrategyOutline, expressionChildEntries, strategyRuleExpressions, researchStrategyScopeIssues,
  STRATEGY_AST_COMPILER_VERSION, type StrategyOutline, type Expression,
} from '@thesis-ledger/domain';
import { createHash } from 'node:crypto';
import { strategyOutlineV6Schema, strategySchema, priceResearchStrategyIssues,
  type BacktestStrategy, type BacktestResearchDataScope } from '@thesis-ledger/schemas';
import type { z } from 'zod';

export type StrategyCompilationDiagnostic = { stage: 'structure' | 'compile' | 'semantic' | 'data-scope';
  code: string; path: readonly (string | number)[]; message: string; details?: Record<string, unknown> };

function structureDiagnostics(issues: readonly z.core.$ZodIssue[], raw: unknown, prefix: readonly (string | number)[] = []): StrategyCompilationDiagnostic[] {
  const read = (path: readonly (string | number)[]) => path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, raw);
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path.map((part) => typeof part === 'number' ? part : String(part))];
    if (issue.code === 'invalid_union') {
      const matching = issue.errors.filter((branch) => !branch.some((child) => child.code === 'invalid_value' && child.path.length === 1 &&
        ['type', 'kind'].includes(String(child.path[0])) && !child.values.includes(read([...path, String(child.path[0])]) as never)));
      const selected = matching.length ? matching : issue.errors;
      const shortest = Math.min(...selected.map((branch) => branch.length));
      return selected.filter((branch) => branch.length === shortest).flatMap((branch) => structureDiagnostics(branch, raw, path));
    }
    return [{ stage: 'structure' as const, code: 'STRUCTURE_INVALID', path, message: issue.message, details: { schemaCode: issue.code } }];
  });
}

function eventBindingDiagnostics(outline: StrategyOutline): StrategyCompilationDiagnostic[] {
  const issues: StrategyCompilationDiagnostic[] = [];
  const visit = (node: Expression, path: readonly (string | number)[], bound: boolean) => {
    if (node.type === 'eventValue' && !bound) issues.push({ stage: 'semantic', code: 'EVENT_VALUE_UNBOUND', path,
      message: '当前作用域没有模型明确声明的capture，不能引用eventValue' });
    for (const child of expressionChildEntries(node)) {
      const capturedBranch = node.type === 'sequence' && ['confirm', 'invalidation'].includes(String(child.path[0]));
      visit(child.expression, [...path, ...child.path], node.type === 'sequence' ? capturedBranch && !!node.capture : bound);
    }
  };
  for (const root of strategyRuleExpressions(outline)) visit(root.expression, root.path, false);
  return issues;
}

export function compileBacktestStrategy(raw: unknown, scope?: BacktestResearchDataScope) {
  const rawFingerprint = createHash('sha256').update(JSON.stringify(raw) ?? 'undefined').digest('hex');
  const parsed = strategyOutlineV6Schema.safeParse(raw);
  const diagnostics: StrategyCompilationDiagnostic[] = [];
  if (!parsed.success) return { compilerVersion: STRATEGY_AST_COMPILER_VERSION, rawFingerprint,
    status: 'rejected' as const, diagnostics: structureDiagnostics(parsed.error.issues, raw).slice(0, 100),
    definition: undefined, candidate: undefined, dependencies: [] };
  const outline = parsed.data as StrategyOutline;
  const compiled = compileStrategyOutline(outline);
  diagnostics.push(...compiled.diagnostics, ...eventBindingDiagnostics(outline));
  const formal = strategySchema.safeParse(compiled.definition);
  if (!formal.success) for (const issue of formal.error.issues) {
    const path = issue.path.map((part) => typeof part === 'number' ? part : String(part));
    if (diagnostics.some((existing) => JSON.stringify(existing.path) === JSON.stringify(path))) continue;
    diagnostics.push({ stage: 'semantic', code: 'STRATEGY_SEMANTIC_INVALID', path, message: issue.message,
      details: { schemaCode: issue.code } });
  }
  if (scope) {
    diagnostics.push(...researchStrategyScopeIssues(compiled.definition, scope).issues.map((issue) => ({
      ...issue, stage: 'data-scope' as const,
    })));
  }
  if (formal.success) diagnostics.push(...priceResearchStrategyIssues(formal.data as BacktestStrategy)
    .map((issue) => ({ ...issue, stage: 'semantic' as const, code: 'PRICE_COORDINATE_INVALID' })));
  const unique = [...new Map(diagnostics.map((issue) => [JSON.stringify([issue.code, issue.path]), issue])).values()];
  return { compilerVersion: STRATEGY_AST_COMPILER_VERSION, rawFingerprint,
    status: unique.length ? 'rejected' as const : 'compiled' as const, diagnostics: unique.slice(0, 100),
    definition: !unique.length && formal.success ? formal.data as BacktestStrategy : undefined,
    candidate: compiled.definition, dependencies: compiled.dependencies };
}

export class StrategyCompilationError extends BadRequestException {
  constructor(readonly compilation: ReturnType<typeof compileBacktestStrategy>) {
    super({ code: 'STRATEGY_COMPILATION_INVALID', message: '策略未通过编译与正式校验',
      compilerVersion: compilation.compilerVersion, diagnostics: compilation.diagnostics });
  }
}

export function requireCompiledStrategy(raw: unknown, scope?: BacktestResearchDataScope) {
  const result = compileBacktestStrategy(raw, scope);
  if (!result.definition) throw new StrategyCompilationError(result);
  return { definition: result.definition, compilation: result };
}
