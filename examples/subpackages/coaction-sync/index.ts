import { create } from 'coaction';
import {
  getSyncApi,
  sync,
  type SyncAdapter,
  type SyncMutation,
  type SyncStorage
} from '@coaction/sync';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createMemoryStorage = (): SyncStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    }
  };
};

export const runExample = async () => {
  const storage = createMemoryStorage();
  // Stands in for a remote: it records what it was pushed, and hands back one
  // change on the next pull so the rebase path is exercised too.
  const pushed: SyncMutation[] = [];
  type PullPatches = NonNullable<
    Awaited<ReturnType<SyncAdapter['pull']>>['patches']
  >;
  let remotePatches: PullPatches = [];
  const adapter: SyncAdapter = {
    pull: async () => {
      const patches = remotePatches;
      remotePatches = [];
      return { patches };
    },
    push: async (mutations) => {
      pushed.push(...mutations);
      return {};
    }
  };

  const store = create(
    (set) => ({
      count: 0,
      label: 'local',
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [sync({ name: 'sync-example', storage, adapter })]
    }
  );
  await nextTick();

  const api = getSyncApi(store);
  store.getState().increment();
  store.getState().increment();
  await nextTick();

  // Local commits land in a durable outbox before they reach the remote.
  const persistedCount = JSON.parse(storage.map.get('sync-example')!).state
    .count as number;

  await api.flush();
  await nextTick();

  // A remote change pulled afterwards is applied on top of the local state.
  remotePatches = [{ op: 'replace', path: ['label'], value: 'remote' }];
  await api.pull();
  await nextTick();

  const result = {
    count: store.getState().count,
    label: store.getState().label,
    persistedCount,
    pushedMutations: pushed.length,
    pendingAfterFlush: api.getPending().length,
    status: api.getStatus()
  };
  store.destroy();

  return result;
};
