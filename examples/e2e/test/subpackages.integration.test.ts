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
import { runExample as runValtioExample } from '../../subpackages/coaction-valtio';
import { runExample as runVueExample } from '../../subpackages/coaction-vue';
import { runExample as runXStateExample } from '../../subpackages/coaction-xstate';
import { runExample as runYjsExample } from '../../subpackages/coaction-yjs';
import { runExample as runZustandExample } from '../../subpackages/coaction-zustand';
import { runExample as runAlienSignalsExample } from '../../subpackages/coaction-alien-signals';

describe('subpackage integration contracts', () => {
  test('core example keeps update semantics', () => {
    expect(runCoreExample()).toMatchObject({
      before: 0,
      after: 1
    });
  });

  test('logger example emits middleware events', () => {
    const result = runLoggerExample();
    expect(result.count).toBe(1);
    expect(result.eventCount).toBeGreaterThan(0);
  });

  test('history example supports undo/redo contract', () => {
    expect(runHistoryExample()).toMatchObject({
      afterIncrement: 2,
      afterUndo: 1,
      afterRedo: 2,
      undone: true,
      redone: true
    });
  });

  test('persist example rehydrates persisted state', async () => {
    expect(await runPersistExample()).toMatchObject({
      count: 1,
      persistedCount: 1
    });
  });

  test('jotai example keeps coaction and atom in sync', () => {
    expect(runJotaiExample()).toMatchObject({
      countAfterCoactionIncrement: 1,
      atomCountAfterCoactionIncrement: 1,
      countAfterAtomWrite: 4,
      atomCountAfterAtomWrite: 4
    });
  });

  test('mobx example keeps computed value aligned', () => {
    expect(runMobxExample()).toMatchObject({
      count: 1,
      double: 2
    });
  });

  test('ng example exposes reactive selectors', () => {
    expect(runNgExample()).toMatchObject({
      count: 1,
      double: 2
    });
  });

  test('pinia example syncs both directions', () => {
    expect(runPiniaExample()).toMatchObject({
      afterCoactionIncrement: 1,
      afterPiniaIncrement: 2,
      afterPiniaStateWrite: 7,
      finalCoactionCount: 10,
      finalPiniaCount: 10
    });
  });

  test('react example keeps state updates observable', () => {
    expect(runReactExample()).toMatchObject({
      before: 0,
      after: 1
    });
  });

  test('redux example syncs both directions', () => {
    expect(runReduxExample()).toMatchObject({
      afterCoactionDispatch: 1,
      afterReduxDispatch: 2,
      finalCoactionCount: 10,
      finalReduxCount: 10
    });
  });

  test('solid example keeps state accessors aligned', () => {
    expect(runSolidExample()).toMatchObject({
      before: 0,
      after: 1
    });
  });

  test('svelte example supports store subscription flow', () => {
    expect(runSvelteExample()).toMatchObject({
      count: 1,
      selectedValues: [0, 1]
    });
  });

  test('valtio example syncs both directions', () => {
    expect(runValtioExample()).toMatchObject({
      afterCoactionIncrement: 1,
      afterSourceIncrement: 2,
      finalCoactionCount: 10,
      finalSourceCount: 10
    });
  });

  test('vue example keeps refs and computed values aligned', () => {
    expect(runVueExample()).toMatchObject({
      count: 1,
      double: 2
    });
  });

  test('xstate example syncs actor and coaction events', () => {
    expect(runXStateExample()).toMatchObject({
      afterCoactionSend: 1,
      afterActorSend: 2
    });
  });

  test('yjs example syncs local and remote updates', async () => {
    expect(await runYjsExample()).toMatchObject({
      countAfterLocalIncrement: 1,
      syncedCountFromLocalIncrement: 1,
      countAfterRemoteWrite: 6
    });
  });

  test('zustand example syncs both directions', () => {
    expect(runZustandExample()).toMatchObject({
      afterCoactionIncrement: 1,
      afterZustandWrite: 7,
      finalCoactionCount: 10,
      finalZustandCount: 10
    });
  });

  test('alien-signals example keeps selector and state aligned', () => {
    expect(runAlienSignalsExample()).toMatchObject({
      count: 1,
      selectedCount: 1
    });
  });
});
