import { useState } from 'react';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { selectDocument, selectImage } from '../../platform/files/select-file';
import { screenshotBody, type PickedFile } from '../../platform/files/picked-file';

export function ScreenshotUpload({
  accountId,
  disabled,
  onUploaded,
}: {
  accountId: string;
  disabled: boolean;
  onUploaded: () => void;
}) {
  const { api } = useMobileRuntime();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [source, setSource] = useState('unknown');
  const [feedback, setFeedback] = useState<string | null>(null);
  useDirtyForm(Boolean(file || source !== 'unknown'), () => {
    setFile(null);
    setSource('unknown');
  });
  const upload = useMobileCommand((selected: PickedFile) =>
    api.imports.uploadScreenshot(screenshotBody(selected, accountId, source), accountId),
  );
  const select = async (image: boolean) => {
    try {
      const selected = image ? await selectImage() : await selectDocument();
      if (selected) {
        setFile(selected);
        setFeedback(null);
      }
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  const submit = async () => {
    if (!file || disabled || upload.isPending) return;
    try {
      const result = await upload.mutateAsync(file);
      setFile(null);
      setSource('unknown');
      let message = '截图已上传，请人工审核后再提交。';
      if (result.result.rows.length === 0)
        message = '截图已保留为草稿，尚未获得可审核的持仓数据。可使用人工录入持仓完成记录。';
      if (result.refreshFailed) message = '截图已上传，草稿尚未刷新。';
      setFeedback(message);
      onUploaded();
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Section title="截图导入">
      <Copy muted>上传仅生成草稿。解析能力不可用时会显示原因，不会自动写入账本。</Copy>
      <Action
        label="从照片选择"
        disabled={disabled || upload.isPending}
        onPress={() => void select(true)}
      />
      <Action
        label="从文件选择图片"
        disabled={disabled || upload.isPending}
        onPress={() => void select(false)}
      />
      {file ? <Copy>{file.name}</Copy> : null}
      <Choices
        label="截图来源"
        value={source}
        options={[
          { value: 'unknown', label: '待核对' },
          { value: 'broker', label: '券商' },
          { value: 'ths', label: '同花顺' },
          { value: 'alipay', label: '支付宝' },
          { value: 'bank', label: '银行' },
          { value: 'fund-platform', label: '基金平台' },
        ]}
        onChange={setSource}
        disabled={upload.isPending}
      />
      <Feedback message={feedback} error={upload.isError} />
      <Action
        label={upload.isPending ? '上传中…' : '上传为草稿'}
        primary
        disabled={disabled || !file || upload.isPending}
        onPress={() => void submit()}
      />
    </Section>
  );
}
