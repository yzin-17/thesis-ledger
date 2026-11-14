import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { InstrumentOptionField } from '../market-data/InstrumentOptionField.js';
import type { useNewResearchSheet } from './use-new-research-sheet.js';

function NewResearchAccountField({ control }: { control: ReturnType<typeof useNewResearchSheet> }) {
  return (
    <>
      {control.scope === 'account' && (
        <Field invalid={Boolean(control.visibleEntityError)}>
          <FieldLabel htmlFor="ai-account">研究账户</FieldLabel>
          <Select
            items={control.accountOptions}
            value={control.effectiveAccountId ?? ''}
            onValueChange={(value) => {
              control.setAccountId(value || null);
              if (control.retryOfRunId) control.setRetryContextReselected(true);
            }}
          >
            <SelectTrigger
              id="ai-account"
              className="w-full"
              aria-invalid={Boolean(control.visibleEntityError)}
            >
              <SelectValue placeholder="选择账户" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {control.accountOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {control.accountsQuery.isPending && (
            <FieldDescription>
              <Spinner aria-label="正在加载账户" />
            </FieldDescription>
          )}
          {control.accountsQuery.isError && <FieldError>账户读取失败，请重试后再提交。</FieldError>}
          {!control.accountsQuery.isPending &&
            !control.accountsQuery.isError &&
            control.accountOptions.length === 0 && (
              <FieldError>暂无可用账户，请先完成账户配置。</FieldError>
            )}
          {!control.accountsQuery.isError && control.accountOptions.length > 0 && (
            <FieldError>{control.visibleEntityError}</FieldError>
          )}
        </Field>
      )}
    </>
  );
}

function NewResearchPositionFields({
  control,
}: {
  control: ReturnType<typeof useNewResearchSheet>;
}) {
  return (
    <>
      {control.scope === 'position' && (
        <>
          <Field invalid={Boolean(control.visibleEntityError && !control.accountId)}>
            <FieldLabel htmlFor="ai-position-account">持仓账户</FieldLabel>
            <Select
              items={control.accountOptions}
              value={control.effectiveAccountId ?? ''}
              onValueChange={(value) => {
                control.setAccountId(value || null);
                control.setSymbol(null);
                if (control.retryOfRunId) control.setRetryContextReselected(true);
              }}
            >
              <SelectTrigger
                id="ai-position-account"
                className="w-full"
                aria-invalid={Boolean(control.visibleEntityError && !control.accountId)}
              >
                <SelectValue placeholder="先选择账户" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {control.accountOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {control.accountsQuery.isPending && (
              <FieldDescription>
                <Spinner aria-label="正在加载账户" />
              </FieldDescription>
            )}
            {control.accountsQuery.isError && (
              <FieldError>账户读取失败，请重试后再提交。</FieldError>
            )}
          </Field>
          <Field invalid={Boolean(control.visibleEntityError && Boolean(control.accountId))}>
            <FieldLabel htmlFor="ai-position-symbol">实际持仓</FieldLabel>
            <InstrumentOptionField
              label="实际持仓"
              id="ai-position-symbol"
              options={control.positionOptions}
              value={control.symbol ?? ''}
              disabled={positionSelectorDisabled(control)}
              invalid={Boolean(control.visibleEntityError && Boolean(control.accountId))}
              onChange={(value) => {
                control.setSymbol(value || null);
                if (control.retryOfRunId) control.setRetryContextReselected(true);
              }}
            />
            {control.positionsQuery.isLoading && (
              <FieldDescription>
                <Spinner aria-label="正在读取账户持仓" />
              </FieldDescription>
            )}
            {control.positionsQuery.isError && (
              <FieldError>持仓读取失败，请重试后再提交。</FieldError>
            )}
            {!control.positionsQuery.isPending &&
              !control.positionsQuery.isError &&
              control.accountId &&
              control.positions.length === 0 && (
                <FieldError>该账户暂无可研究的实际持仓。</FieldError>
              )}
            {!control.positionsQuery.isError && control.positions.length > 0 && (
              <FieldError>
                {control.visibleEntityError && control.accountId
                  ? control.visibleEntityError
                  : undefined}
              </FieldError>
            )}
          </Field>
        </>
      )}
    </>
  );
}

function positionSelectorDisabled(control: ReturnType<typeof useNewResearchSheet>) {
  return !control.accountId || control.positionsQuery.isPending || control.positionsQuery.isError;
}

function NewResearchStrategyField({
  control,
}: {
  control: ReturnType<typeof useNewResearchSheet>;
}) {
  return (
    <>
      {control.scope === 'strategy' && (
        <Field invalid={Boolean(control.visibleEntityError)}>
          <FieldLabel htmlFor="ai-strategy-version">策略版本</FieldLabel>
          <Select
            items={control.strategyOptions}
            value={control.strategyVersionId ?? ''}
            onValueChange={(value) => {
              control.setStrategyVersionId(value || null);
              if (control.retryOfRunId) control.setRetryContextReselected(true);
            }}
          >
            <SelectTrigger
              id="ai-strategy-version"
              className="w-full"
              aria-invalid={Boolean(control.visibleEntityError)}
            >
              <SelectValue placeholder="选择策略版本" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {control.strategyOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {control.strategiesQuery.isPending && (
            <FieldDescription>
              <Spinner aria-label="正在加载策略版本" />
            </FieldDescription>
          )}
          {control.strategiesQuery.isError && (
            <FieldError>策略读取失败，请重试后再提交。</FieldError>
          )}
          {!control.strategiesQuery.isPending &&
            !control.strategiesQuery.isError &&
            control.strategyVersions.length === 0 && <FieldError>暂无可用策略版本。</FieldError>}
          {control.selectedStrategy && (
            <FieldDescription>
              已选择 {control.selectedStrategy.strategy.name} v
              {control.selectedStrategy.version.version}
            </FieldDescription>
          )}
          {!control.strategiesQuery.isError && control.strategyVersions.length > 0 && (
            <FieldError>{control.visibleEntityError}</FieldError>
          )}
        </Field>
      )}
    </>
  );
}

function NewResearchReadBoundary({ control }: { control: ReturnType<typeof useNewResearchSheet> }) {
  return (
    <>
      <Alert>
        <AlertTitle>本次预计读取</AlertTitle>
        <AlertDescription>
          {control.scope === 'strategy'
            ? '策略版本按自身对象读取。'
            : `当前为${control.mode === 'shadow' ? '模拟' : '实际'}账户范围。`}
          {control.retryModeMismatch &&
            '原任务属于另一模式，请先通过全局开关切换至原范围后再重试。'}
          {control.boundary}。来源是否可用以服务端实际返回为准，缺失来源会在结果中明确标注。
          {` ${control.capabilityMessage}`}
        </AlertDescription>
      </Alert>
    </>
  );
}

export {
  NewResearchAccountField,
  NewResearchPositionFields,
  NewResearchReadBoundary,
  NewResearchStrategyField,
};
