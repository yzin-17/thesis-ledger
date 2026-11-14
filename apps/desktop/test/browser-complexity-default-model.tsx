import { useState, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { ResearchDefaultModelField } from '../src/features/ai/ResearchDefaultModelField';
import '../src/ui/styles.css';

const options = [
  { value: 'unpriced', label: '受控提供方 / 尚未填写价格的研究模型', priceConfigured: false },
  { value: 'priced', label: '受控提供方 / 已填写价格的研究模型', priceConfigured: true },
];
function Fixture() {
  const [phase, setPhase] = useState('ready');
  const [selectedKey, choose] = useState('unpriced');
  const [savedKey, saveKey] = useState('unpriced');
  const selected = options.find(({ value }) => value === selectedKey);
  const state: ComponentProps<typeof ResearchDefaultModelField>['model'] = {
    query: {
      isPending: phase === 'loading',
      isError: phase === 'error',
      isFetching: phase === 'loading',
    },
    options,
    selected,
    selectedKey,
    currentDefault: savedKey === 'none' ? null : { providerId: 'controlled', model: savedKey },
    dirty: savedKey !== selectedKey,
    saving: phase === 'saving',
    error: null,
    choose: (value) => choose(value ?? 'none'),
    save: () => saveKey(selectedKey),
    reload: () => setPhase('ready'),
  };
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setPhase('loading')}>
          加载样本
        </Button>
        <Button variant="outline" onClick={() => setPhase('error')}>
          失败样本
        </Button>
        <Button variant="outline" onClick={() => setPhase('ready')}>
          正常样本
        </Button>
      </div>
      <ResearchDefaultModelField model={state} />
      <output aria-label="受控保存结果">{savedKey}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
