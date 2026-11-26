import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.js';
import ProviderIsolationSequencer from './provider-isolation-sequencer.js';

export default mergeConfig(base, defineConfig({
  test: { sequence: { sequencer: ProviderIsolationSequencer } },
}));
