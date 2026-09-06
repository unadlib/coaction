import { create } from 'coaction';
import { applyPatches } from 'coaction/adapter';
import { getSyncApi, sync, type SyncAdapter, type SyncStorage } from '../src';

/**
 * The outbox is what this client owes the remote, expressed as patches. So the
 * remote's view of this store, once it has taken everything queued, is the
 * durable baseline with every pending mutation applied — and that has to be the
 * state this client is showing.
 *
 * A write that reaches the state without producing a commit never reaches the
 * outbox either, and the two views part company permanently. Asserting on the
 * local state cannot see that; this can.
 */
const nextTick = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createMemoryStorage = (): SyncStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    }
  };
};

const offline: SyncAdapter = {
  pull: async () => ({}),
  push: () => new Promise<never>(() => undefined)
};

test('the outbox applied to the baseline is the state the client shows', async () => {
  const store = create<{
    count: number;
    label: string;
    bump: () => void;
    rename: (to: string) => void;
  }>(
    (set) => ({
      count: 0,
      label: 'a',
      bump() {
        set(() => {
          this.count += 1;
        });
      },
      rename(to: string) {
        set(() => {
          this.label = to;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'outbox-replay',
          storage: createMemoryStorage(),
          adapter: offline
        })
      ]
    }
  );
  await nextTick();
  const baseline = { count: 0, label: 'a' };

  // Every way of writing, including the two forms of `apply` and a replay.
  store.getState().bump();
  store.getState().rename('b');
  store.setState({ count: 10, label: 'c' });
  store.apply(store.getPureState(), [
    { op: 'replace', path: ['count'], value: 20 }
  ]);
  store.apply({ ...store.getPureState(), label: 'd' });
  await nextTick();

  const pending = getSyncApi(store).getPending();
  expect(pending.length).toBe(5);
  const remote = pending.reduce(
    (state, mutation) => applyPatches(state, mutation.patches),
    baseline as object
  );
  expect(remote).toEqual(store.getPureState());
  store.destroy();
});
