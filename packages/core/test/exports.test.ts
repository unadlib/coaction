import * as core from '../src';
import * as adapter from '../adapter';
import * as local from '../local';
import * as shared from '../shared';
import { create } from '../src/create';
import { createLocal } from '../src/createLocal';

test('re-exports runtime APIs from package entry', () => {
  expect(core.create).toBe(create);
  expect(shared.create).toBeInstanceOf(Function);
  expect(shared.ActionAuthorityChangedError).toBeInstanceOf(Function);
  expect('ActionAuthorityChangedError' in local).toBe(false);
  expect(local.create).not.toBe(create);
  expect('createLocal' in core).toBe(false);
  expect('createBinder' in core).toBe(false);
  expect('defineExternalStoreAdapter' in core).toBe(false);
  expect('createReactiveTracker' in core).toBe(false);
  expect('wrapStore' in core).toBe(false);
  expect(adapter.createBinder).toBeInstanceOf(Function);
  expect(adapter.defineExternalStoreAdapter).toBeInstanceOf(Function);
  expect(adapter.createReactiveTracker).toBeInstanceOf(Function);
  expect(adapter.wrapStore).toBeInstanceOf(Function);
  expect(adapter.onStoreCommit).toBeInstanceOf(Function);
  expect(adapter.replayStorePatches).toBeInstanceOf(Function);
  expect(core.signal).toBeInstanceOf(Function);
  expect(core.computed).toBeInstanceOf(Function);
  expect(core.effect).toBeInstanceOf(Function);
  expect(core.trigger).toBeInstanceOf(Function);
});

test('local entry creates local stores and rejects shared options', () => {
  const store = local.create(() => ({ count: 0 }));
  const directStore = createLocal(() => ({ count: 1 }));
  expect(store.share).toBe(false);
  expect(store.getState().count).toBe(0);
  expect(directStore.getState().count).toBe(1);

  expect(() =>
    createLocal(() => ({ count: 0 }), {
      transport: {}
    } as any)
  ).toThrow(/Option 'transport' requires the shared entry point/);

  // "no worker here" is a local store, not an error.
  const degraded = createLocal<{ count: number }>(() => ({ count: 2 }), {
    worker: undefined,
    transport: undefined
  } as never);
  expect(degraded.share).toBe(false);
  expect(degraded.getState().count).toBe(2);
  degraded.destroy();
});

test('adapter lifecycle observes stores created by a separate entry bundle', () => {
  const store = local.create(() => ({ count: 0 }));
  const ready = jest.fn();

  adapter.onStoreReady(store, ready);

  expect(ready).toHaveBeenCalledTimes(1);
  store.destroy();
});
