import { useMemo, useState } from 'react';
import {
  Action,
  Copy,
  Feedback,
  Page,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { MobileChart } from '../../platform/charts/MobileChart';
import { selectDocument, selectImage } from '../../platform/files/select-file';
import { exportCsv } from '../../platform/output/export-file';
import { openExternalLink } from '../../platform/links/open-link';
import { exampleChartWindow } from './chart-preview-data';

export function ChartPreview() {
  const [count, setCount] = useState(30);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState({
    touch: 0,
    move: 0,
    range: 0,
    cancel: 0,
    end: 0,
  });
  const data = useMemo(() => exampleChartWindow(count), [count]);
  const pick = async (image: boolean) => {
    try {
      const file = image ? await selectImage() : await selectDocument();
      setFeedback(file ? `已选择 ${file.name}；未上传。` : '已取消选择。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title="图表与文件预览">
      <Copy muted>仅含明示示例数据，不读取行情、不上传文件。</Copy>
      <Section title={`示例 K 线与指标 · ${count} 根`}>
        <MobileChart
          data={data}
          onOlder={() => setCount((value) => Math.min(90, value + 10))}
          onReady={() => setReady(true)}
          onDiagnostic={(kind) =>
            setDiagnostics((value) => ({ ...value, [kind]: value[kind] + 1 }))
          }
        />
        <Copy muted>{ready ? '本地图表已加载，可拖动或缩放。' : '等待本地图表加载。'}</Copy>
        <Copy muted>
          开始事件 {diagnostics.touch} · 移动事件 {diagnostics.move} · 窗口变化 {diagnostics.range}{' '}
          · 取消事件 {diagnostics.cancel} · 结束事件 {diagnostics.end}
        </Copy>
      </Section>
      <Action label="选择照片" onPress={() => void pick(true)} />
      <Action label="选择图片文件" onPress={() => void pick(false)} />
      <Action
        label="导出示例 CSV"
        onPress={() =>
          void exportCsv('thesis-ledger-example.csv', 'date,value\n2026-01-01,10.2\n')
            .then(() => setFeedback('已打开系统分享。'))
            .catch((error) => setFeedback(failureMessage(error)))
        }
      />
      <Action
        label="在浏览器打开 Expo 文档"
        onPress={() =>
          void openExternalLink('https://docs.expo.dev/guides/prebuilt-expo-modules/', [
            'docs.expo.dev',
          ])
            .then(() => setFeedback('已打开系统浏览器，返回后可继续。'))
            .catch((error) => setFeedback(failureMessage(error)))
        }
      />
      <Feedback message={feedback} />
    </Page>
  );
}
