import { useRef, useState, type ReactNode } from 'react';
import { requestFailureMessage } from '@/shared/api/request-error';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthoringWorkPage } from '../strategy-authoring/AuthoringWorkPage.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToastManager } from '@/components/ui/toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useCreateStrategyMutation,
  useCreateStrategyVersionMutation,
} from './strategy.mutations.js';
import { StrategyEditorSheet } from './StrategyEditorSheet.js';
import {
  findStrategyVersion,
  latestStrategyVersion,
  strategyCenterFocusState,
  strategyCenterPath,
  strategyCenterTriggerId,
} from './strategy-center.navigation.js';
import type { StrategyRecord, StrategySchema } from './strategy.types.js';

function StrategyEditorDrawerState({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet
      open
      triggerId={strategyCenterTriggerId.editVersion}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent
        size="form"
        className="overflow-hidden"
        finalFocus={() => document.getElementById(strategyCenterTriggerId.editVersion)}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

export function StrategyEditorPage({
  strategies,
  loading,
  mode,
  presentation = 'page',
}: {
  strategies: StrategyRecord[];
  loading: boolean;
  mode: 'create' | 'edit';
  presentation?: 'page' | 'drawer';
}) {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creationMode, setCreationMode] = useState(searchParams.has('draft') || searchParams.get('authoring') === '1' ? 'authoring' : 'manual');
  const [authoringDirty, setAuthoringDirty] = useState(false);
  const selection =
    mode === 'edit' ? findStrategyVersion(strategies, params.strategyId, params.versionId) : null;
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowNavigationRef = useRef(false);
  const createStrategy = useCreateStrategyMutation();
  const createVersion = useCreateStrategyVersionMutation();
  const toastManager = useToastManager();
  const busy = createStrategy.isPending || createVersion.isPending;
  const strategy = selection?.strategy ?? null;
  const version = selection?.version ?? null;
  useNavigationGuard({ dirty: dirty || authoringDirty, busy,
    bypass: () => allowNavigationRef.current,
    blocksLocation: (currentLocation, nextLocation) => {
    const leavingPage = currentLocation.pathname !== nextLocation.pathname;
    const changingDraft = new URLSearchParams(currentLocation.search).get('draft') !== new URLSearchParams(nextLocation.search).get('draft');
    return leavingPage || (authoringDirty && changingDraft);
  } });

  const closePage = () => {
    allowNavigationRef.current = true;
    let destination: string = strategyCenterPath.library;
    if (strategy && version) {
      destination = strategyCenterPath.strategyVersion(strategy.id, version.id);
    } else if (params.strategyId && params.versionId) {
      destination = strategyCenterPath.strategyVersion(params.strategyId, params.versionId);
    }
    void navigate(destination, {
      state: strategyCenterFocusState(strategyCenterTriggerId.editVersion),
    });
  };

  if (mode === 'edit' && loading) {
    if (presentation === 'drawer') {
      return (
        <StrategyEditorDrawerState
          title="编辑当前版本"
          description="正在读取明确的策略版本…"
          onClose={closePage}
        />
      );
    }
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">正在读取策略版本…</div>
    );
  }
  if (mode === 'edit' && !selection) {
    const unavailable = (
      <Alert variant="destructive">
        <AlertTitle>无法编辑这个版本</AlertTitle>
        <AlertDescription>地址未解析到明确策略版本，系统不会以最新版本代替。</AlertDescription>
      </Alert>
    );
    if (presentation === 'drawer') {
      return (
        <StrategyEditorDrawerState
          title="编辑当前版本"
          description="无法读取来源版本"
          onClose={closePage}
        >
          {unavailable}
        </StrategyEditorDrawerState>
      );
    }
    return unavailable;
  }

  const save = async (schema: StrategySchema) => {
    if (busy) return;
    setError(null);
    try {
      if (mode === 'create') {
        const name =
          typeof schema.name === 'string' && schema.name.trim() ? schema.name.trim() : '未命名策略';
        const created = await createStrategy.mutateAsync({ name, schema });
        const createdVersion = latestStrategyVersion(created.versions);
        if (!createdVersion) throw new Error('策略已创建，但响应中没有可定位的版本');
        toastManager.add({ title: '策略已创建', description: '首个版本已保存，无需重复创建。', type: 'success' });
        allowNavigationRef.current = true;
        void navigate(strategyCenterPath.strategyVersion(created.id, createdVersion.id), {
          replace: true,
          state: strategyCenterFocusState(strategyCenterTriggerId.editVersion),
        });
        return;
      }
      if (!strategy) return;
      const createdVersion = await createVersion.mutateAsync({ strategyId: strategy.id, schema });
      toastManager.add({ title: '新版本已保存', description: '原版本保持不变，无需重复保存。', type: 'success' });
      allowNavigationRef.current = true;
      void navigate(strategyCenterPath.strategyVersion(strategy.id, createdVersion.id), {
        replace: true,
        state: strategyCenterFocusState(strategyCenterTriggerId.editVersion),
      });
    } catch (cause) {
      setError(requestFailureMessage(cause, '保存失败，请保留当前输入后重试。'));
    }
  };

  const editor = (
    <>
      <StrategyEditorSheet
        open
        presentation={presentation === 'drawer' ? 'sheet' : 'page'}
        mode={mode}
        strategy={strategy}
        version={version}
        busy={busy}
        errorMessage={error}
        triggerId={presentation === 'drawer' ? strategyCenterTriggerId.editVersion : undefined}
        onDirtyChange={setDirty}
        onOpenChange={(open) => {
          if (!open) closePage();
        }}
        onSave={(schema) => void save(schema)}
      />
    </>
  );

  if (presentation === 'drawer') return editor;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          策略中心 / 策略库 /{' '}
          {mode === 'create'
            ? '新建策略'
            : `${strategy?.name ?? '策略'} v${version?.version ?? '?'}`}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          {mode === 'create' ? '新建策略' : '编辑当前版本'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'create'
            ? '保存后创建策略与首个明确版本。'
            : `基于 v${version?.version ?? '?'} 编辑，保存后创建新版本，原版本保持不变。`}
        </p>
      </div>
      {mode === 'create' ? <Tabs value={creationMode} onValueChange={(value: unknown) => {
        if (typeof value !== 'string') return;
        setCreationMode(value);
        const next = new URLSearchParams(searchParams);
        if (value === 'authoring') next.set('authoring', '1'); else next.delete('authoring');
        setSearchParams(next, { replace: true });
      }}><TabsList><TabsTrigger value="manual">手动编写</TabsTrigger><TabsTrigger value="authoring">自然语言创建</TabsTrigger></TabsList>
        <TabsContent value="manual" keepMounted>{editor}</TabsContent>
        <TabsContent value="authoring" keepMounted><AuthoringWorkPage onDirtyChange={setAuthoringDirty} onSaved={(strategyId, versionId) => {
          allowNavigationRef.current = true;
          void navigate(strategyCenterPath.strategyVersion(strategyId, versionId), { replace: true });
        }} /></TabsContent>
      </Tabs> : editor}
    </div>
  );
}
