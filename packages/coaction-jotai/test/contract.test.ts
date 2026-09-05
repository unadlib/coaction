import { create } from 'coaction/shared';
import { expect, expectTypeOf, test, vi } from 'vitest';
import { atom, createStore } from '../src';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, bindJotai } from '../src';

type Counter = {
  count: number;
  increment: () => void;
};

const createCounterStore = () => {
  const store = createStore();
  const count = atom(0);
  const atoms = {
    count
  };
  const state = adapt(
    bindJotai({
      store,
      atoms,
      actions: ({ store, atoms }) => ({
        increment() {
          store.set(atoms.count, store.get(atoms.count) + 1);
        }
      })
    })
  );
  return {
    store,
    atoms,
    state
  };
};

runBinderAdapterContract({
  packageName: '@coaction/jotai',
  createLocalContract: () => {
    const { store, atoms, state } = createCounterStore();
    return {
      createState: () => state,
      readValue: (useStore) => useStore.getState().count,
      invokeUpdate: (useStore) => useStore.getState().increment(),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        store.set(atoms.count, 7);
      },
      expectedValueAfterExternalWrite: 7
    };
  },
  createWorkerContract: () => {
    const server = createCounterStore();
    const client = createCounterStore();
    return {
      createServerState: () => server.state,
      createClientState: () => client.state,
      readValue: (useStore) => useStore.getState().count,
      readClientExternal: () => client.store.get(client.atoms.count),
      invokeServer: (useStore) => useStore.getState().increment(),
      expectedValueAfterServerUpdate: 1,
      invokeClient: (useStore) => useStore.getState().increment(),
      expectedValueAfterClientUpdate: 2,
      writeServerExternal: () => {
        server.store.set(server.atoms.count, 7);
      },
      expectedValueAfterServerExternalWrite: 7,
      writeClientExternal: () => {
        client.store.set(client.atoms.count, 9);
      }
    };
  }
});

test('rejects client atom writes without diverging from coaction state', async () => {
  const clientTransport = {
    dispose: vi.fn(),
    emit: vi.fn(),
    listen: vi.fn(),
    onConnect: vi.fn()
  };
  const client = createCounterStore();
  const clientStore = create(() => client.state, {
    name: '@coaction-jotai-client-write',
    clientTransport: clientTransport as any
  });

  try {
    let error: unknown;
    try {
      client.store.set(client.atoms.count, 10);
    } catch (caught) {
      error = caught;
    }

    expect((error as { name?: string }).name).toBe('AggregateError');
    expect((error as { errors?: Error[] }).errors?.[0]?.message).toBe(
      'client jotai store cannot be updated'
    );
    expect(client.store.get(client.atoms.count)).toBe(0);
    expect(clientStore.getState().count).toBe(0);
  } finally {
    clientStore.destroy();
  }
});

test('type expectations', () => {
  const { state } = createCounterStore();
  expectTypeOf(state).toMatchTypeOf<Counter>();
});
