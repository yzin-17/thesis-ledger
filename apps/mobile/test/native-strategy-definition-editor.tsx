import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { registerRootComponent } from 'expo';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MobileProviders, useMobileRuntime } from '../src/app/MobileRuntime';
import type { StrategyStackParams } from '../src/app/strategy-navigation';
import { Action, Copy, Page } from '../src/components/MobilePrimitives';
import { StrategyEditorScreen } from '../src/features/strategy-editor/StrategyEditorScreen';
import {
  clearNativeEditorStorage,
  resetNativeEditorStorage,
} from './native-strategy-definition-storage';

const Stack = createNativeStackNavigator<StrategyStackParams>();
function Launcher({ navigation }: NativeStackScreenProps<StrategyStackParams, 'StrategyLibrary'>) {
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  const [cleared, setCleared] = useState(false);
  const { changeConnection } = useMobileRuntime();
  return (
    <Page title="原生策略编辑验收">
      <Copy>实际编辑器、键盘、导航和原生存储；业务接口使用受控接收端。</Copy>
      <Action
        label="重置本轮草稿"
        onPress={() =>
          void resetNativeEditorStorage()
            .then(() => client.clear())
            .then(() => changeConnection('http://127.0.0.1:5193/api/v1'))
            .then(() => setReady(true))
        }
      />
      <Action
        label="打开验收策略"
        disabled={!ready}
        onPress={() =>
          navigation.navigate('StrategyEditor', {
            strategyId: 'editor-strategy',
            versionId: 'editor-version',
          })
        }
      />
      <Action
        label="清理本轮草稿"
        onPress={() =>
          void clearNativeEditorStorage().then(() => {
            setReady(false);
            setCleared(true);
          })
        }
      />
      {cleared && <Copy>本轮草稿已清理</Copy>}
    </Page>
  );
}
function NativeEditorAcceptance() {
  return (
    <SafeAreaProvider>
      <MobileProviders>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="StrategyLibrary">
            <Stack.Screen
              name="StrategyLibrary"
              component={Launcher}
              options={{ title: '验收入口' }}
            />
            <Stack.Screen
              name="StrategyEditor"
              component={StrategyEditorScreen}
              options={{ title: '策略编辑', headerBackTitle: '返回' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </MobileProviders>
    </SafeAreaProvider>
  );
}
registerRootComponent(NativeEditorAcceptance);
