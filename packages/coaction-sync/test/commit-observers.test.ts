import { create } from 'coaction';
import { applyPatches } from 'coaction/adapter';
import { getSyncApi, sync, type SyncStorage } from '../src';

const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const memory = () => {
  const map = new Map<string, string>();
  const storage: SyncStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
  return { map, storage };
};

test.each(['throw', 'write'] as const)(
  'remote subscriber %s preserves the committed checkpoint and pending journal',
  async (kind) => {
    const { map, storage } = memory();
    const store = create(
      { value: 0 },
      {
        middlewares: [
          sync({
            name: 'remote-observer',
            storage,
            conflict: 'remote-wins',
            adapter: {
              pull: async () => ({
                cursor: 'next',
                patches: [{ op: 'replace', path: ['value'], value: 10 }]
              }),
              push: async () => ({ ack: [] })
            },
            retry: { initialMs: 100000 }
          })
        ]
      }
    );
    const api = getSyncApi(store);
    await api.flush();
    store.setState({ value: 1 });
    await api.flush();
    const stop = store.subscribe(() => {
      if (store.getState().value !== 10) return;
      if (kind === 'throw') throw new Error('observer');
      store.setState({ value: 11 });
    });
    if (kind === 'throw') await expect(api.pull()).rejects.toThrow('observer');
    else await api.pull();
    stop();
    await tick();
    const persisted = JSON.parse(map.get('remote-observer')!);
    expect(persisted.cursor).toBe('next');
    expect(persisted.state).toEqual(store.getPureState());
    expect(persisted.outbox).toEqual(api.getPending());
    expect(api.getPending()).toHaveLength(kind === 'throw' ? 0 : 1);
    expect(
      api
        .getPending()
        .reduce((state, mutation) => applyPatches(state, mutation.patches), {
          value: 10
        })
    ).toEqual(store.getPureState());
    store.destroy();
  }
);

test('hydration observers can write without losing their new pending mutation', async () => {
  const { map, storage } = memory();
  map.set(
    'hydration-observer',
    JSON.stringify({ state: { value: 10 }, outbox: [] })
  );
  const store = create(
    { value: 0 },
    {
      middlewares: [
        sync({
          name: 'hydration-observer',
          storage,
          adapter: { pull: async () => ({}), push: async () => ({ ack: [] }) },
          retry: { initialMs: 100000 }
        })
      ]
    }
  );
  const stop = store.subscribe(() => {
    if (store.getState().value === 10) store.setState({ value: 11 });
  });
  const api = getSyncApi(store);
  await api.flush();
  stop();
  await tick();
  expect(store.getPureState().value).toBe(11);
  expect(api.getPending()).toHaveLength(1);
  const persisted = JSON.parse(map.get('hydration-observer')!);
  expect(persisted.state.value).toBe(11);
  expect(persisted.outbox).toEqual(api.getPending());
  store.destroy();
});
