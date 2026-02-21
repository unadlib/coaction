import { runExample as runCoreExample } from '../../subpackages/core';
import { runExample as runLoggerExample } from '../../subpackages/logger';
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
import { runExample as runValtioExample } from '../../subpackages/coaction-valtio';
import { runExample as runVueExample } from '../../subpackages/coaction-vue';
import { runExample as runXStateExample } from '../../subpackages/coaction-xstate';
import { runExample as runYjsExample } from '../../subpackages/coaction-yjs';
import { runExample as runZustandExample } from '../../subpackages/coaction-zustand';
import { runExample as runAlienSignalsExample } from '../../subpackages/coaction-alien-signals';

describe('subpackage examples e2e', () => {
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
      count: 1,
      atomCount: 1
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
      count: 1
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
      count: 1
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
      count: 1
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
      count: 1
    });
  });

  test('yjs example', () => {
    expect(runYjsExample()).toEqual({
      count: 1,
      syncedCount: 1
    });
  });

  test('zustand example', () => {
    expect(runZustandExample()).toEqual({
      count: 1
    });
  });

  test('alien-signals example', () => {
    expect(runAlienSignalsExample()).toEqual({
      count: 1,
      selectedCount: 1
    });
  });
});
