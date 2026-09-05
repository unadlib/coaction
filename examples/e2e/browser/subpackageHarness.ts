import { runExample as runCoreExample } from '../../subpackages/core';
import { runExample as runLoggerExample } from '../../subpackages/coaction-logger';
import { runExample as runHistoryExample } from '../../subpackages/coaction-history';
import { runExample as runPersistExample } from '../../subpackages/coaction-persist';
import { runExample as runJotaiExample } from '../../subpackages/coaction-jotai';
import { runExample as runMobxExample } from '../../subpackages/coaction-mobx';
import { runExample as runNgExample } from '../../subpackages/coaction-ng';
import { runExample as runPiniaExample } from '../../subpackages/coaction-pinia';
import { runExample as runReactExample } from '../../subpackages/coaction-react';
import { runExample as runReduxExample } from '../../subpackages/coaction-redux';
import { runExample as runSolidExample } from '../../subpackages/coaction-solid';
import { runExample as runSvelteExample } from '../../subpackages/coaction-svelte';
import { runExample as runSyncExample } from '../../subpackages/coaction-sync';
import { runExample as runValtioExample } from '../../subpackages/coaction-valtio';
import { runExample as runVueExample } from '../../subpackages/coaction-vue';
import { runExample as runXStateExample } from '../../subpackages/coaction-xstate';
import { runExample as runYjsExample } from '../../subpackages/coaction-yjs';
import { runExample as runZustandExample } from '../../subpackages/coaction-zustand';

export type SubpackageHarnessResult = {
  core: ReturnType<typeof runCoreExample>;
  logger: ReturnType<typeof runLoggerExample>;
  history: ReturnType<typeof runHistoryExample>;
  persist: Awaited<ReturnType<typeof runPersistExample>>;
  jotai: ReturnType<typeof runJotaiExample>;
  mobx: ReturnType<typeof runMobxExample>;
  ng: ReturnType<typeof runNgExample>;
  pinia: ReturnType<typeof runPiniaExample>;
  react: ReturnType<typeof runReactExample>;
  redux: ReturnType<typeof runReduxExample>;
  solid: ReturnType<typeof runSolidExample>;
  svelte: ReturnType<typeof runSvelteExample>;
  sync: Awaited<ReturnType<typeof runSyncExample>>;
  valtio: ReturnType<typeof runValtioExample>;
  vue: ReturnType<typeof runVueExample>;
  xstate: ReturnType<typeof runXStateExample>;
  yjs: Awaited<ReturnType<typeof runYjsExample>>;
  zustand: ReturnType<typeof runZustandExample>;
};

export type SubpackageHarness = {
  runAllExamples: () => Promise<SubpackageHarnessResult>;
};

export const createSubpackageHarness = (): SubpackageHarness => ({
  async runAllExamples() {
    return {
      core: runCoreExample(),
      logger: runLoggerExample(),
      history: runHistoryExample(),
      persist: await runPersistExample(),
      jotai: runJotaiExample(),
      mobx: runMobxExample(),
      ng: runNgExample(),
      pinia: runPiniaExample(),
      react: runReactExample(),
      redux: runReduxExample(),
      solid: runSolidExample(),
      svelte: runSvelteExample(),
      sync: await runSyncExample(),
      valtio: runValtioExample(),
      vue: runVueExample(),
      xstate: runXStateExample(),
      yjs: await runYjsExample(),
      zustand: runZustandExample()
    };
  }
});
