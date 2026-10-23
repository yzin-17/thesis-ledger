import { useState } from 'react';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { allocationLabels } from '../performance-read/performance-projection';
import { buildTargetsInput, targetDraft, type TargetDraft } from './targets-command';
import type { PerformanceTargetsWire } from '@thesis-ledger/schemas';
export function TargetsForm({
  data,
  accountId,
  readable,
  reload,
}: {
  data: PerformanceTargetsWire;
  accountId: string | null;
  readable: boolean;
  reload: () => Promise<PerformanceTargetsWire | null>;
}) {
  const { api } = useMobileRuntime();
  const [draft, setDraft] = useState(() => targetDraft(data.targets));
  const [saved, setSaved] = useState(draft);
  const [version, setVersion] = useState(data.version);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const unknown = Object.keys(data.targets).filter((key) => !(key in allocationLabels));
  useDirtyForm(dirty, () => setDraft(saved));
  const mutation = useMobileCommand((value: TargetDraft) =>
    api.performance.saveTargets(buildTargetsInput(value, accountId)),
  );
  const submit = async () => {
    if (mutation.isPending || !readable || locked || !dirty || unknown.length) return;
    try {
      buildTargetsInput(draft, accountId);
      if (
        !(await confirmAction(
          '保存配置目标？',
          accountId
            ? '本账户目标会产生一个新版本。'
            : '组合目标在实际与模拟范围共享。保存会产生一个新版本。',
        ))
      )
        return;
      const result = await mutation.mutateAsync(draft);
      setSaved(draft);
      setVersion(result.result.version);
      setFeedback(
        result.refreshFailed ? '目标已保存，数据尚未刷新，请勿重复保存。' : '配置目标已保存。',
      );
    } catch (error) {
      if (!(
        error instanceof ThesisLedgerApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409
      ))
        setLocked(true);
      setFeedback(failureMessage(error));
    }
  };
  const reconcile = async () => {
    const latest = await reload();
    if (!latest) return;
    if (
      !(await confirmAction(
        '重新核对目标版本？',
        `服务端当前版本 ${latest.version ?? '无'}。确认后保留当前输入，保存会新增版本。`,
      ))
    )
      return;
    setVersion(latest.version);
    setLocked(false);
    if (JSON.stringify(targetDraft(latest.targets)) === JSON.stringify(draft)) {
      setSaved(draft);
      setFeedback('当前输入已与服务端目标一致，无需重复保存。');
    } else setFeedback('已核对当前目标，请检查输入后保存。');
  };
  return (
    <Section title="目标权重">
      <Copy muted>当前版本 {version ?? '尚未设置'} · 权重合计必须为 100%。</Copy>
      {unknown.length ? (
        <Feedback
          message={`存在无法识别的配置类别：${unknown.join('、')}，请先核对原目标。`}
          error
        />
      ) : null}
      {(Object.keys(allocationLabels) as Array<keyof TargetDraft>).map((category) => (
        <Field
          key={category}
          label={`${allocationLabels[category]}目标（%）`}
          value={draft[category]}
          onChange={(value) => setDraft((current) => ({ ...current, [category]: value }))}
          keyboardType="decimal-pad"
          editable={!mutation.isPending}
        />
      ))}
      <Feedback message={feedback} error={mutation.isError || locked} />
      <Action
        label="重新核对配置目标"
        disabled={mutation.isPending}
        onPress={() => void reconcile()}
      />
      <Action
        label="保存配置目标"
        disabled={mutation.isPending || !readable || !dirty || locked || unknown.length > 0}
        primary
        onPress={() => void submit()}
      />
    </Section>
  );
}
