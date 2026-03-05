import { runExample as runCoreExample } from '../../../examples/subpackages/core';
import { runExample as runLoggerExample } from '../../../examples/subpackages/coaction-logger';
import { runExample as runHistoryExample } from '../../../examples/subpackages/coaction-history';
import { runExample as runPersistExample } from '../../../examples/subpackages/coaction-persist';
import { runExample as runJotaiExample } from '../../../examples/subpackages/coaction-jotai';
import { runExample as runMobxExample } from '../../../examples/subpackages/coaction-mobx';
import { runExample as runNgExample } from '../../../examples/subpackages/coaction-ng';
import { runExample as runPiniaExample } from '../../../examples/subpackages/coaction-pinia';
import { runExample as runReactExample } from '../../../examples/subpackages/coaction-react';
import { runExample as runReduxExample } from '../../../examples/subpackages/coaction-redux';
import { runExample as runSolidExample } from '../../../examples/subpackages/coaction-solid';
import { runExample as runSvelteExample } from '../../../examples/subpackages/coaction-svelte';
import { runExample as runValtioExample } from '../../../examples/subpackages/coaction-valtio';
import { runExample as runVueExample } from '../../../examples/subpackages/coaction-vue';
import { runExample as runXStateExample } from '../../../examples/subpackages/coaction-xstate';
import { runExample as runYjsExample } from '../../../examples/subpackages/coaction-yjs';
import { runExample as runZustandExample } from '../../../examples/subpackages/coaction-zustand';
import { runExample as runAlienSignalsExample } from '../../../examples/subpackages/coaction-alien-signals';

describe('subpackage examples integration', () => {
  test('coaction core example', () => {
    expect(runCoreExample()).toEqual({
      before: 0,
      after: 1
    });
  });

  test('logger example', () => {
    const result = runLoggerExample();
    expect(result.count).toBe(1);
    expect(result.eventCount).toBeGreaterThan(0);
  });

  test('history example', () => {
    expect(runHistoryExample()).toEqual({
      afterIncrement: 2,
      undone: true,
      afterUndo: 1,
      redone: true,
      afterRedo: 2,
      canUndo: true,
      canRedo: false
    });
  });

  test('persist example', async () => {
    expect(await runPersistExample()).toEqual({
      count: 1,
      persistedCount: 1
    });
  });

  test('jotai example', () => {
    expect(runJotaiExample()).toEqual({
      countAfterCoactionIncrement: 1,
      atomCountAfterCoactionIncrement: 1,
      countAfterAtomWrite: 4,
      atomCountAfterAtomWrite: 4
    });
  });

  test('mobx example', () => {
    expect(runMobxExample()).toEqual({
      count: 1,
      double: 2
    });
  });

  test('ng example', () => {
    expect(runNgExample()).toEqual({
      count: 1,
      double: 2
    });
  });

  test('pinia example', () => {
    expect(runPiniaExample()).toEqual({
      afterCoactionIncrement: 1,
      afterPiniaIncrement: 2,
      afterPiniaStateWrite: 7,
      finalCoactionCount: 10,
      finalPiniaCount: 10
    });
  });

  test('react example', () => {
    expect(runReactExample()).toEqual({
      before: 0,
      after: 1
    });
  });

  test('redux example', () => {
    expect(runReduxExample()).toEqual({
      afterCoactionDispatch: 1,
      afterReduxDispatch: 2,
      finalCoactionCount: 10,
      finalReduxCount: 10
    });
  });

  test('solid example', () => {
    expect(runSolidExample()).toEqual({
      before: 0,
      after: 1
    });
  });

  test('svelte example', () => {
    expect(runSvelteExample()).toEqual({
      count: 1,
      selectedValues: [0, 1]
    });
  });

  test('valtio example', () => {
    expect(runValtioExample()).toEqual({
      afterCoactionIncrement: 1,
      afterSourceIncrement: 2,
      finalCoactionCount: 10,
      finalSourceCount: 10
    });
  });

  test('vue example', () => {
    expect(runVueExample()).toEqual({
      count: 1,
      double: 2
    });
  });

  test('xstate example', () => {
    expect(runXStateExample()).toEqual({
      afterCoactionSend: 1,
      afterActorSend: 2
    });
  });

  test('yjs example', async () => {
    expect(await runYjsExample()).toEqual({
      countAfterLocalIncrement: 1,
      syncedCountFromLocalIncrement: 1,
      countAfterRemoteWrite: 6
    });
  });

  test('zustand example', () => {
    expect(runZustandExample()).toEqual({
      afterCoactionIncrement: 1,
      afterZustandWrite: 7,
      finalCoactionCount: 10,
      finalZustandCount: 10
    });
  });

  test('alien-signals example', () => {
    expect(runAlienSignalsExample()).toEqual({
      count: 1,
      selectedCount: 1
    });
  });
});
