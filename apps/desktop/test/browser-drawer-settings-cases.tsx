import { useState } from 'react';
import { ProviderEditorSheet } from '../src/features/providers/ProviderEditorSheet.js';
import { AutomationEditorSheet } from '../src/features/providers/AutomationEditorSheet.js';
import {
  newAiProviderDraft,
  newProviderDraft,
  newAutomationJobDraft,
} from '../src/features/providers/providers.types.js';
import { ProviderCredentialsSheet } from '../src/features/market-data/ProviderCredentialsSheet.js';
import { ProviderExactChecksSheet } from '../src/features/market-data/ProviderExactChecksSheet.js';
import { RiskRuleEditorSheet } from '../src/features/risk/RiskRuleEditorSheet.js';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet.js';
import { StrategyEditorPage } from '../src/features/strategy/StrategyEditorPage.js';
import { StrategyRiskApplicationPage } from '../src/features/strategy/StrategyRiskApplicationPage.js';
import {
  drawerAccount as account,
  drawerPosition as position,
  drawerStrategy as strategy,
  drawerProvider as provider,
} from './browser-drawer-samples.js';

export function DrawerSettingsCases({ scenario }: { scenario: string }) {
  const [open, setOpen] = useState(true);
  const [providerDraft, setProviderDraft] = useState(() =>
    scenario === 'provider-ai'
      ? {
          ...newAiProviderDraft(),
          modelsText: Array.from({ length: 12 }, (_, i) => `隔离模型-${i + 1}`).join('\n'),
        }
      : newProviderDraft(),
  );
  const [automationDraft, setAutomationDraft] = useState(() => ({
    ...newAutomationJobDraft(),
    schedulePreset: 'custom',
    cron: '0 5 16 * * 1-5',
  }));
  if (!open) return null;
  const props = { open, onOpenChange: setOpen };
  if (scenario === 'provider-ai' || scenario === 'provider-notification')
    return (
      <ProviderEditorSheet
        {...props}
        editingProviderName={null}
        providerDraft={providerDraft}
        credentialInputOpen
        providerTestState="error"
        savingProviderDraft={false}
        onUpdateDraft={setProviderDraft}
        onResetTest={() => {}}
        onSetCredentialInputOpen={() => {}}
        onAuthModeChange={(value) =>
          setProviderDraft((current) => ({ ...current, authMode: value }))
        }
        onTypeChange={(type) => setProviderDraft((current) => ({ ...current, type }))}
        onClose={() => setOpen(false)}
        onTest={() => {}}
        onSave={(event) => event.preventDefault()}
      />
    );
  if (scenario === 'automation')
    return (
      <AutomationEditorSheet
        {...props}
        editingJob={null}
        draft={automationDraft}
        saving={false}
        onUpdateDraft={setAutomationDraft}
        onClose={() => setOpen(false)}
        onSubmit={(event) => event.preventDefault()}
      />
    );
  if (scenario === 'market-credentials')
    return <ProviderCredentialsSheet provider={provider as never} onClose={() => setOpen(false)} />;
  if (scenario === 'market-checks')
    return (
      <ProviderExactChecksSheet
        provider={provider as never}
        catalog={undefined}
        onClose={() => setOpen(false)}
        onConfigure={() => {}}
      />
    );
  if (scenario === 'risk-create' || scenario === 'risk-edit')
    return (
      <RiskRuleEditorSheet
        {...props}
        rule={
          scenario === 'risk-edit'
            ? ({
                id: 'fixture-rule',
                kind: 'price-below',
                scope: 'security',
                severity: 'warning',
                threshold: 10,
                symbol: position.symbol,
                accountId: account.id,
                enabled: true,
              } as never)
            : null
        }
        accounts={[account]}
        positions={[position]}
        pending={false}
        onSubmit={async () => false}
      />
    );
  if (scenario === 'strategy-editor' || scenario === 'strategy-json')
    return (
      <StrategyEditorSheet
        {...props}
        mode="edit"
        strategy={strategy}
        version={strategy.versions[0]}
        busy={false}
        errorMessage={'隔离保存失败，当前输入保留。'.repeat(15)}
        onSave={() => {}}
      />
    );
  if (scenario === 'strategy-state-loading' || scenario === 'strategy-state-error')
    return (
      <StrategyEditorPage
        strategies={[]}
        loading={scenario.endsWith('loading')}
        mode="edit"
        presentation="drawer"
      />
    );
  if (scenario === 'strategy-risk')
    return <StrategyRiskApplicationPage strategies={[strategy]} presentation="drawer" />;
  return null;
}
