import * as adapter from 'coaction/adapter';
import * as entry from '../index';
import * as shared from '../shared';
import { create } from '../src/create';
import { createLocal } from '../src/createLocal';

test('the default entry publishes the local runtime', () => {
  // `coaction` is the single-context runtime: its `create` is the transport-free
  // one, and the client-mode error cannot happen without a transport.
  expect(entry.create).toBe(createLocal);
  expect(entry.create).not.toBe(create);
  expect('ActionAuthorityChangedError' in entry).toBe(false);
  expect('createLocal' in entry).toBe(false);
  expect('createBinder' in entry).toBe(false);
  expect('defineExternalStoreAdapter' in entry).toBe(false);
  expect('createReactiveTracker' in entry).toBe(false);
  expect(entry.signal).toBeInstanceOf(Function);
  expect(entry.computed).toBeInstanceOf(Function);
  expect(entry.effect).toBeInstanceOf(Function);
  expect(entry.trigger).toBeInstanceOf(Function);
  expect(entry.applyPatches).toBeInstanceOf(Function);
});

test('the shared entry publishes the transport runtime', () => {
  // `../shared` resolves to the built CJS shim rather than the source module,
  // so the contract is asserted by shape: a creator distinct from the default
  // entry's, plus the client-mode error only a transport can raise.
  expect(shared.create).toBeInstanceOf(Function);
  expect(shared.create).not.toBe(entry.create);
  expect(shared.ActionAuthorityChangedError).toBeInstanceOf(Function);
});

test('adapter internals stay in the adapter entry', () => {
  expect(adapter.createBinder).toBeInstanceOf(Function);
  expect(adapter.defineExternalStoreAdapter).toBeInstanceOf(Function);
  expect(adapter.createReactiveTracker).toBeInstanceOf(Function);
  expect(adapter.wrapStore).toBeInstanceOf(Function);
  expect(adapter.onStoreCommit).toBeInstanceOf(Function);
  expect(adapter.replayStorePatches).toBeInstanceOf(Function);
});

test('the default entry creates local stores and rejects shared options', () => {
  const store = entry.create(() => ({ count: 0 }));
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
  const store = entry.create(() => ({ count: 0 }));
  const ready = jest.fn();

  adapter.onStoreReady(store, ready);

  expect(ready).toHaveBeenCalledTimes(1);
  store.destroy();
});
