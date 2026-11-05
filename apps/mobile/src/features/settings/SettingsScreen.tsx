import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime, useDirtyForm } from '../../app/MobileRuntime';
import { checkConnection } from '../../platform/connection/connection';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import type { SettingsStackParams } from '../../app/navigation-types';
export function SettingsScreen() {
  const runtime = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParams>>();
  const [address, setAddress] = useState(runtime.baseUrl);
  const [feedback, setFeedback] = useState<string | null>(null);
  const active = useRef(true);
  const attempt = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      attempt.current += 1;
    };
  }, []);
  const changeAddress = (value: string) => {
    attempt.current += 1;
    setAddress(value);
  };
  useDirtyForm(address !== runtime.baseUrl, () => changeAddress(runtime.baseUrl));
  const check = useMutation({
    mutationFn: (url: string) => checkConnection(url),
    networkMode: 'always',
    retry: false,
  });
  const connect = async () => {
    const currentAttempt = ++attempt.current;
    try {
      const normalized = await check.mutateAsync(address);
      if (!active.current || currentAttempt !== attempt.current) return;
      const changed = await runtime.changeConnection(normalized);
      if (changed && active.current && currentAttempt === attempt.current) {
        setAddress(normalized);
        setFeedback('服务已连接。');
      }
    } catch (error) {
      if (active.current && currentAttempt === attempt.current) setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title="更多">
      <Section title="配置与运行">
        <Action label="AI 模型与来源" onPress={() => navigation.navigate('AiProviders')} />
        <Action label="行情来源与账号" onPress={() => navigation.navigate('MarketProviders')} />
        <Action label="行情路由配置" onPress={() => navigation.navigate('MarketPolicy')} />
        <Action label="标的目录与同步" onPress={() => navigation.navigate('MarketCatalog')} />
        <Action label="自动化任务" onPress={() => navigation.navigate('Automations')} />
        <Action label="来源与通知诊断" onPress={() => navigation.navigate('Diagnostics')} />
      </Section>
      <Section title="服务连接">
        <Copy muted>填写手机可以访问的 API 地址。当前：{runtime.baseUrl}</Copy>
        <Field
          label="API 地址"
          value={address}
          onChange={changeAddress}
          keyboardType="url"
          editable={!check.isPending}
        />
        <Action
          label={check.isPending ? '正在连接…' : '验证并连接'}
          onPress={() => void connect()}
          disabled={check.isPending}
          primary
        />
        <Feedback message={feedback} error={check.isError} />
      </Section>
      <Section title="外观">
        <Choices
          label="主题"
          value={runtime.themePreference}
          options={[
            { value: 'system', label: '跟随系统' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ]}
          onChange={runtime.changeTheme}
        />
        <Choices
          label="涨跌配色"
          value={runtime.marketColor}
          options={[
            { value: 'red-up', label: '红涨绿跌' },
            { value: 'green-up', label: '绿涨红跌' },
          ]}
          onChange={runtime.changeMarketColor}
        />
      </Section>
      <Feedback message={runtime.storageError} error />
      {__DEV__ ? (
        <Action label="图表与文件预览" onPress={() => navigation.navigate('ChartPreview')} />
      ) : null}
    </Page>
  );
}
