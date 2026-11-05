import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { focusManager, onlineManager } from '@tanstack/react-query';

export function installNativeQueryLifecycle() {
  focusManager.setFocused(AppState.currentState === 'active');
  const app = AppState.addEventListener('change', (state) =>
    focusManager.setFocused(state === 'active'),
  );
  let active = true;
  let networkRevision = 0;
  const network = Network.addNetworkStateListener((state) => {
    networkRevision += 1;
    onlineManager.setOnline(state.isConnected !== false);
  });
  const initialRevision = networkRevision;
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (active && networkRevision === initialRevision)
        onlineManager.setOnline(state.isConnected !== false);
    })
    .catch(() => undefined);
  return () => {
    active = false;
    app.remove();
    network.remove();
  };
}
