import { create } from 'coaction';
import { history, type HistoryApi } from '@coaction/history';
import {
  createFetchSyncAdapter,
  getSyncApi,
  sync,
  type SyncAdapter,
  type SyncPullResult,
  type SyncStatus,
  type SyncStorage
} from '../src';

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

const pendingPush = () => new Promise<never>(() => undefined);

/**
 * Wait for a condition rather than for a duration.
 *
 * These assertions are about the retry timer having fired, not about how long
 * that took. A fixed sleep encodes the runner's speed into the test and fails
 * on a loaded one for reasons that have nothing to do with the code.
 */
const waitUntil = async (condition: () => boolean, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('waitUntil timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  await nextTick();
};

test('persists optimistic state and durable outbox across restart', async () => {
  const storage = createMemoryStorage();
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: pendingPush
  };
  const createCounter = () =>
    create(
      (set) => ({
        count: 0,
        increment() {
          set(() => {
            this.count += 1;
          });
        }
      }),
      {
        middlewares: [sync({ name: 'counter-sync', storage, adapter })]
      }
    );

  const first = createCounter();
  await nextTick();
  first.getState().increment();
  await nextTick();

  const persisted = JSON.parse(storage.map.get('counter-sync')!);
  expect(persisted.state.count).toBe(1);
  expect(persisted.outbox).toHaveLength(1);
  first.destroy();

  const second = createCounter();
  await nextTick();
  expect(second.getState().count).toBe(1);
  expect(getSyncApi(second).getPending()).toHaveLength(1);
  second.destroy();
});

test('rebases commits created before asynchronous hydration completes', async () => {
  let resolveHydration!: (value: string | null) => void;
  const writes = new Map<string, string>();
  const mainKey = 'delayed-hydration';
  const journalKey = `${mainKey}::coaction-sync-pre-hydration`;
  const storage: SyncStorage = {
    getItem: (name) => {
      if (name === journalKey) return writes.get(name) ?? null;
      return new Promise<string | null>((resolve) => {
        resolveHydration = resolve;
      });
    },
    setItem: (name, value) => {
      writes.set(name, value);
    },
    removeItem: (name) => {
      writes.delete(name);
    }
  };
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: pendingPush
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [sync({ name: mainKey, storage, adapter })]
    }
  );

  // This commit happens against the initial in-memory state while the durable
  // snapshot is still loading.
  store.getState().increment();
  await nextTick();
  expect(writes.has(mainKey)).toBe(false);
  expect(JSON.parse(writes.get(journalKey)!).outbox).toHaveLength(1);

  const durable = {
    outbox: [
      {
        id: 'durable-1',
        patches: [{ op: 'replace', path: ['count'], value: 5 }],
        inversePatches: [{ op: 'replace', path: ['count'], value: 0 }],
        createdAt: 1
      }
    ],
    state: { count: 5 }
  };
  resolveHydration(JSON.stringify(durable));
  await nextTick();

  expect(store.getState().count).toBe(1);
  // The pre-hydration mutation is replayed on top of the durable value. Since
  // it is a replace patch captured against count=0, the correct optimistic
  // value remains 1 and its new inverse points back to the durable base.
  const pending = getSyncApi(store).getPending();
  expect(pending).toHaveLength(2);
  expect(pending[1].inversePatches).toEqual([
    { op: 'replace', path: ['count'], value: 5 }
  ]);
  expect(writes.has(mainKey)).toBe(true);
  expect(writes.has(journalKey)).toBe(false);
  store.destroy();
});

test('remote-wins drops conflicting optimistic commits', async () => {
  const storage = createMemoryStorage();
  const adapter: SyncAdapter = {
    pull: async () => ({
      patches: [{ op: 'replace', path: ['doc', 'title'], value: 'remote' }]
    }),
    push: pendingPush
  };
  const store = create(
    (set) => ({
      doc: { title: 'base', body: 'body' },
      editTitle(title: string) {
        set(() => {
          this.doc.title = title;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'remote-wins',
          storage,
          adapter,
          conflict: 'remote-wins'
        })
      ]
    }
  );
  await nextTick();
  store.getState().editTitle('local');
  await nextTick();

  await getSyncApi(store).pull();

  expect(store.getState().doc.title).toBe('remote');
  expect(getSyncApi(store).getPending()).toHaveLength(0);
  store.destroy();
});

test('local-wins rebase refreshes inverse patches against each remote base', async () => {
  const storage = createMemoryStorage();
  let remoteTitle = 'remote-1';
  const adapter: SyncAdapter = {
    pull: async () => ({
      patches: [{ op: 'replace', path: ['doc', 'title'], value: remoteTitle }]
    }),
    push: pendingPush
  };
  const store = create(
    (set) => ({
      doc: { title: 'base' },
      editTitle(title: string) {
        set(() => {
          this.doc.title = title;
        });
      }
    }),
    {
      middlewares: [sync({ name: 'local-wins', storage, adapter })]
    }
  );
  await nextTick();
  store.getState().editTitle('local');
  await nextTick();

  await getSyncApi(store).pull();
  expect(store.getState().doc.title).toBe('local');
  expect(getSyncApi(store).getPending()[0].inversePatches).toEqual([
    { op: 'replace', path: ['doc', 'title'], value: 'remote-1' }
  ]);

  remoteTitle = 'remote-2';
  await getSyncApi(store).pull();
  expect(store.getState().doc.title).toBe('local');
  expect(getSyncApi(store).getPending()[0].inversePatches).toEqual([
    { op: 'replace', path: ['doc', 'title'], value: 'remote-2' }
  ]);
  store.destroy();
});

test('custom conflict policy only runs for overlapping patch paths', async () => {
  const storage = createMemoryStorage();
  let conflicts = 0;
  const adapter: SyncAdapter = {
    pull: async () => ({
      patches: [{ op: 'replace', path: ['doc', 'body'], value: 'remote-body' }]
    }),
    push: pendingPush
  };
  const store = create(
    (set) => ({
      doc: { title: 'base', body: 'base-body' },
      editTitle() {
        set(() => {
          this.doc.title = 'local-title';
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'custom-conflict',
          storage,
          adapter,
          conflict: () => {
            conflicts += 1;
            return 'remote';
          }
        })
      ]
    }
  );
  await nextTick();
  store.getState().editTitle();
  await nextTick();

  await getSyncApi(store).pull();

  expect(conflicts).toBe(0);
  expect(store.getState().doc.title).toBe('local-title');
  expect(store.getState().doc.body).toBe('remote-body');
  store.destroy();
});

test('createFetchSyncAdapter encodes pull context and push mutations', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ ack: ['m1'], revision: 'r2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(null, { status: 204 });
  };
  const adapter = createFetchSyncAdapter({
    url: 'https://example.test/sync',
    fetch: fetchImpl,
    headers: { authorization: 'Bearer token' }
  });

  await adapter.pull({ cursor: 'c1', revision: 'r1' });
  const pushResult = await adapter.push(
    [
      {
        id: 'm1',
        patches: [{ op: 'replace', path: ['count'], value: 1 }],
        inversePatches: [{ op: 'replace', path: ['count'], value: 0 }],
        createdAt: 1
      }
    ],
    { cursor: 'c1', revision: 'r1' }
  );

  expect(calls[0].url).toContain('cursor=c1');
  expect(calls[0].url).toContain('revision=r1');
  expect(calls[1].init?.method).toBe('POST');
  expect(new Headers(calls[1].init?.headers).get('content-type')).toBe(
    'application/json'
  );
  expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
    cursor: 'c1',
    revision: 'r1'
  });
  expect(pushResult).toEqual({ ack: ['m1'], revision: 'r2' });
});

test('flush also delivers mutations created while a push is in flight', async () => {
  const storage = createMemoryStorage();
  let resolveFirstPush!: (value: { ack: string[] }) => void;
  const pushed: string[][] = [];
  let pushCount = 0;
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async (mutations) => {
      pushed.push(mutations.map(({ id }) => id));
      pushCount += 1;
      if (pushCount === 1) {
        return new Promise((resolve) => {
          resolveFirstPush = resolve;
        });
      }
      return { ack: mutations.map(({ id }) => id) };
    }
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    { middlewares: [sync({ name: 'flush-in-flight', storage, adapter })] }
  );
  await nextTick();

  store.getState().increment();
  await nextTick();
  expect(pushCount).toBe(1);
  const firstId = getSyncApi(store).getPending()[0].id;

  store.getState().increment();
  await nextTick();
  const pendingDuringPush = getSyncApi(store).getPending();
  expect(pendingDuringPush).toHaveLength(2);
  const secondId = pendingDuringPush[1].id;

  resolveFirstPush({ ack: [firstId] });
  await nextTick();
  await getSyncApi(store).flush();

  expect(pushed).toContainEqual([firstId]);
  expect(pushed.some((ids) => ids.includes(secondId))).toBe(true);
  expect(getSyncApi(store).getPending()).toHaveLength(0);
  store.destroy();
});

test('hydration failure is not allowed to overwrite the unread durable state', async () => {
  const writes = new Map<string, string>();
  const errors: unknown[] = [];
  const storage: SyncStorage = {
    getItem: (name) => {
      if (name.endsWith('::coaction-sync-pre-hydration')) return null;
      return Promise.reject(new Error('storage unavailable'));
    },
    setItem: (name, value) => {
      writes.set(name, value);
    },
    removeItem: (name) => {
      writes.delete(name);
    }
  };
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: pendingPush
  };
  const store = create(() => ({ count: 0 }), {
    middlewares: [
      sync({
        name: 'failed-hydration',
        storage,
        adapter,
        onError: (error) => errors.push(error)
      })
    ]
  });
  await nextTick();

  expect(errors).toHaveLength(1);
  expect(writes.has('failed-hydration')).toBe(false);
  await expect(getSyncApi(store).pull()).rejects.toThrow('storage unavailable');
  store.destroy();
});

test('a pending mutation the remote made unapplicable is dropped, not retried forever', async () => {
  const storage = createMemoryStorage();
  let remotePatches: SyncPullResult['patches'] = [];
  const errors: unknown[] = [];
  const adapter: SyncAdapter = {
    pull: async () => {
      const patches = remotePatches;
      remotePatches = [];
      return { patches };
    },
    push: pendingPush
  };
  const store = create(
    (set) => ({
      items: [{ id: 'a', done: false }],
      toggle() {
        set(() => {
          this.items[0].done = true;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'drop-sync',
          storage,
          adapter,
          onError: (error) => errors.push(error)
        })
      ]
    }
  );
  await nextTick();
  const api = getSyncApi(store);

  store.getState().toggle();
  await nextTick();
  expect(api.getPending()).toHaveLength(1);

  // The remote deletes the very item the pending edit is inside of, so that
  // edit can never be replayed again.
  remotePatches = [{ op: 'remove', path: ['items', 0] }];
  await expect(api.pull()).resolves.toBeUndefined();
  await nextTick();

  expect(store.getState().items).toEqual([]);
  expect(api.getPending()).toHaveLength(0);
  expect(api.getStatus()).toBe('idle');
  expect(errors).toHaveLength(1);
  // The entry the edit was inside of is the one the remote removed, so the
  // reason names that rather than the generic "does not apply".
  expect((errors[0] as Error).message).toMatch(
    /dropped pending mutation .* removed by the remote/
  );
  store.destroy();
});

test('hydration completes when a pre-hydration commit cannot be rebased', async () => {
  const storage = createMemoryStorage();
  const errors: unknown[] = [];
  let resolveHydration: (value: string | null) => void = () => undefined;
  const gatedStorage: SyncStorage = {
    ...storage,
    getItem: (key) =>
      key === 'gated-sync'
        ? new Promise<string | null>((resolve) => {
            resolveHydration = resolve;
          })
        : storage.getItem(key)
  };
  const adapter: SyncAdapter = { pull: async () => ({}), push: pendingPush };
  const store = create(
    (set) => ({
      items: [{ id: 'a', done: false }],
      toggle() {
        set(() => {
          this.items[0].done = true;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'gated-sync',
          storage: gatedStorage,
          adapter,
          onError: (error) => errors.push(error)
        })
      ]
    }
  );

  // Commit while the durable snapshot is still loading.
  store.getState().toggle();
  await nextTick();

  // The durable snapshot has no items at all, so the pre-hydration commit has
  // nothing to rebase onto.
  resolveHydration(JSON.stringify({ outbox: [], state: { items: [] } }));
  await nextTick();

  expect(getSyncApi(store).getStatus()).toBe('idle');
  expect(store.getState().items).toEqual([]);
  expect(getSyncApi(store).getPending()).toHaveLength(0);
  expect(errors).toHaveLength(1);
  store.destroy();
});

test('a failed push backs off and recovers on the scheduled retry', async () => {
  const storage = createMemoryStorage();
  const statuses: SyncStatus[] = [];
  const errors: unknown[] = [];
  let pushAttempts = 0;
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async () => {
      pushAttempts += 1;
      if (pushAttempts === 1) throw new Error('offline');
      return {};
    }
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'retry-sync',
          storage,
          adapter,
          retry: { initialMs: 5, maxMs: 10, factor: 2 },
          onError: (error) => errors.push(error),
          onStatusChange: (status) => statuses.push(status)
        })
      ]
    }
  );
  await nextTick();

  store.getState().increment();
  await nextTick();

  expect(pushAttempts).toBe(1);
  expect((errors[0] as Error).message).toBe('offline');
  // reportError marks the failure, then the backoff timer parks it offline.
  expect(statuses).toContain('error');
  expect(statuses).toContain('offline');
  expect(getSyncApi(store).getPending()).toHaveLength(1);

  await waitUntil(() => pushAttempts > 1);
  expect(pushAttempts).toBeGreaterThan(1);
  expect(getSyncApi(store).getPending()).toHaveLength(0);
  expect(getSyncApi(store).getStatus()).toBe('idle');
  store.destroy();
});

test('status subscribers receive transitions until they unsubscribe', async () => {
  const storage = createMemoryStorage();
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async () => ({})
  };
  const store = create(() => ({ count: 0 }), {
    middlewares: [sync({ name: 'status-sync', storage, adapter })]
  });
  const api = getSyncApi(store);
  const seen: SyncStatus[] = [];
  const unsubscribe = api.subscribe((status) => seen.push(status));

  await nextTick();
  expect(api.getStatus()).toBe('idle');
  expect(seen).toContain('idle');

  await api.pull();
  expect(seen).toContain('syncing');

  const before = seen.length;
  unsubscribe();
  await api.pull();
  expect(seen).toHaveLength(before);
  store.destroy();
});

test('clearPending drops the outbox and the durable journal', async () => {
  const storage = createMemoryStorage();
  const adapter: SyncAdapter = { pull: async () => ({}), push: pendingPush };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [sync({ name: 'clear-sync', storage, adapter })]
    }
  );
  await nextTick();
  const api = getSyncApi(store);

  store.getState().increment();
  await nextTick();
  expect(api.getPending()).toHaveLength(1);

  await api.clearPending();
  expect(api.getPending()).toHaveLength(0);
  expect(JSON.parse(storage.map.get('clear-sync')!).outbox).toEqual([]);
  // The optimistic value stays; only the undelivered mutations are discarded.
  expect(store.getState().count).toBe(1);
  store.destroy();
});

test('adapter subscriptions apply server-pushed patches', async () => {
  const storage = createMemoryStorage();
  let emit: (update: SyncPullResult) => void = () => undefined;
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async () => ({}),
    subscribe: (listener) => {
      emit = listener;
      return () => {
        emit = () => undefined;
      };
    }
  };
  const store = create(() => ({ count: 0 }), {
    middlewares: [sync({ name: 'push-sync', storage, adapter })]
  });
  await nextTick();

  emit({ patches: [{ op: 'replace', path: ['count'], value: 7 }] });
  await nextTick();

  expect(store.getState().count).toBe(7);
  store.destroy();
});

test('persistState false keeps the outbox durable without the snapshot', async () => {
  const storage = createMemoryStorage();
  const adapter: SyncAdapter = { pull: async () => ({}), push: pendingPush };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({ name: 'lean-sync', storage, adapter, persistState: false })
      ]
    }
  );
  await nextTick();

  store.getState().increment();
  await nextTick();

  const persisted = JSON.parse(storage.map.get('lean-sync')!);
  expect(persisted.state).toBeUndefined();
  expect(persisted.outbox).toHaveLength(1);
  store.destroy();
});

test('createFetchSyncAdapter surfaces a failed response', async () => {
  const adapter = createFetchSyncAdapter({
    url: 'https://example.test/sync',
    fetch: async () =>
      new Response('nope', { status: 503, statusText: 'Service Unavailable' })
  });

  await expect(adapter.pull({})).rejects.toThrow(/503/);
});

test('mutations the remote declines are retried, not stranded', async () => {
  const storage = createMemoryStorage();
  const statuses: SyncStatus[] = [];
  let acceptAll = false;
  const delivered: string[] = [];
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async (mutations) => {
      if (acceptAll) {
        delivered.push(...mutations.map(({ id }) => id));
        return {};
      }
      // A remote is allowed to take some and refuse the rest.
      delivered.push(mutations[0].id);
      return { ack: [mutations[0].id] };
    }
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'partial-ack',
          storage,
          adapter,
          retry: { initialMs: 5, maxMs: 10 },
          onStatusChange: (status) => statuses.push(status)
        })
      ]
    }
  );
  await nextTick();
  const api = getSyncApi(store);

  store.getState().increment();
  store.getState().increment();
  store.getState().increment();
  await nextTick();

  // Two were refused. Reporting idle here would leave them undelivered until
  // some unrelated commit happened to flush again.
  expect(api.getPending()).toHaveLength(2);
  expect(api.getStatus()).toBe('offline');
  // It must not have settled on idle with work still undelivered.
  expect(statuses[statuses.length - 1]).toBe('offline');

  acceptAll = true;
  await waitUntil(() => api.getPending().length === 0);
  expect(api.getPending()).toHaveLength(0);
  expect(api.getStatus()).toBe('idle');
  expect(new Set(delivered).size).toBe(3);
  store.destroy();
});

test('a storage read that throws is reported without an unhandled rejection', async () => {
  // Both the snapshot and the journal are read up front. The journal read is
  // only awaited when a commit beats hydration, so an unguarded failure there
  // surfaces as an unhandled rejection — which fails this suite outright.
  const errors: unknown[] = [];
  const explodingStorage: SyncStorage = {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => undefined,
    removeItem: () => undefined
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'exploding',
          storage: explodingStorage,
          adapter: { pull: async () => ({}), push: async () => ({}) },
          onError: (error) => errors.push(error)
        })
      ]
    }
  );
  await nextTick();
  store.getState().increment();
  await nextTick();

  expect(errors.length).toBeGreaterThan(0);
  expect((errors[0] as Error).message).toBe('storage unavailable');
  expect(store.getState().count).toBe(1);
  store.destroy();
});

test('patches returned by push rebase the local state', async () => {
  const storage = createMemoryStorage();
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async () => ({
      patches: [{ op: 'replace', path: ['doc', 'title'], value: 'server' }],
      cursor: 'c9'
    })
  };
  const store = create(
    (set) => ({
      doc: { title: 'base' },
      editTitle(title: string) {
        set(() => {
          this.doc.title = title;
        });
      }
    }),
    { middlewares: [sync({ name: 'push-rebase', storage, adapter })] }
  );
  await nextTick();

  store.getState().editTitle('local');
  await nextTick();

  expect(store.getState().doc.title).toBe('server');
  expect(getSyncApi(store).getPending()).toHaveLength(0);
  expect(JSON.parse(storage.map.get('push-rebase')!).cursor).toBe('c9');
  store.destroy();
});

test('conflict detection understands JSON Pointer remote paths', async () => {
  const storage = createMemoryStorage();
  let remotePatches: SyncPullResult['patches'] = [];
  const adapter: SyncAdapter = {
    pull: async () => {
      const patches = remotePatches;
      remotePatches = [];
      return { patches };
    },
    push: pendingPush
  };
  const store = create(
    (set) => ({
      doc: { title: 'base' },
      editTitle(title: string) {
        set(() => {
          this.doc.title = title;
        });
      }
    }),
    { middlewares: [sync({ name: 'pointer', storage, adapter })] }
  );
  await nextTick();

  store.getState().editTitle('local');
  await nextTick();

  // A remote is free to send RFC 6901 pointers rather than path arrays.
  remotePatches = [
    { op: 'replace', path: '/doc/title', value: 'remote' }
  ] as unknown as SyncPullResult['patches'];
  await getSyncApi(store).pull();
  await nextTick();

  // local-wins: the overlap is recognised and the local edit is replayed on top.
  expect(store.getState().doc.title).toBe('local');
  expect(getSyncApi(store).getPending()).toHaveLength(1);
  store.destroy();
});

test('destroying mid-flight abandons the in-flight push and pull', async () => {
  const storage = createMemoryStorage();
  let releasePush: () => void = () => undefined;
  let releasePull: () => void = () => undefined;
  const adapter: SyncAdapter = {
    pull: () =>
      new Promise((resolve) => {
        releasePull = () =>
          resolve({
            patches: [{ op: 'replace', path: ['count'], value: 42 }]
          });
      }),
    push: () =>
      new Promise((resolve) => {
        releasePush = () => resolve({});
      })
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    { middlewares: [sync({ name: 'mid-flight', storage, adapter })] }
  );
  await nextTick();
  const api = getSyncApi(store);

  store.getState().increment();
  await nextTick();
  const pulling = api.pull();
  await nextTick();

  store.destroy();
  releasePush();
  releasePull();
  await expect(pulling).resolves.toBeUndefined();
  await nextTick();

  // The remote result arrived after destroy and must not be applied.
  expect(store.getPureState().count).toBe(1);
});

test('a commit that changes nothing is not pushed', async () => {
  let pushes = 0;
  const store = create(
    (set) => ({
      count: 0,
      touch() {
        set(() => {
          this.count = this.count;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'noop',
          storage: createMemoryStorage(),
          adapter: {
            pull: async () => ({}),
            push: async () => {
              pushes += 1;
              return {};
            }
          }
        })
      ]
    }
  );
  await nextTick();
  store.getState().touch();
  await nextTick();

  expect(pushes).toBe(0);
  expect(getSyncApi(store).getPending()).toHaveLength(0);
  store.destroy();
});

test('sync() refuses a client mirror and getSyncApi refuses a plain store', () => {
  const middleware = sync({
    name: 'guard',
    storage: createMemoryStorage(),
    adapter: { pull: async () => ({}), push: async () => ({}) }
  });
  expect(() =>
    middleware({ share: 'client' } as unknown as Parameters<
      typeof middleware
    >[0])
  ).toThrow(/not supported on a client mirror/);

  const plain = create(() => ({ count: 0 }));
  expect(() => getSyncApi(plain)).toThrow(
    /requires a store enhanced with sync/
  );
  plain.destroy();
});

test('an explicit flush does not send before the write has landed', async () => {
  const order: string[] = [];
  const pendingWrites: Array<() => void> = [];
  let holding = true;
  const releaseWrites = () => {
    order.push('persisted');
    holding = false;
    while (pendingWrites.length) pendingWrites.shift()!();
  };
  const slowStorage: SyncStorage = {
    getItem: () => null,
    setItem: () =>
      holding
        ? new Promise<void>((resolve) => {
            pendingWrites.push(resolve);
          })
        : Promise.resolve(),
    removeItem: () => undefined
  };
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async () => {
      order.push('pushed');
      return {};
    }
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    { middlewares: [sync({ name: 'durable', storage: slowStorage, adapter })] }
  );
  await nextTick();

  store.getState().increment();
  const flushing = getSyncApi(store).flush();
  await nextTick();

  // The write is still outstanding, so nothing may have reached the remote.
  expect(order).toEqual([]);

  releaseWrites();
  await flushing;
  expect(order).toEqual(['persisted', 'pushed']);
  store.destroy();
});

test('a pull that failed is retried as a pull, not just a flush', async () => {
  let attempts = 0;
  const adapter: SyncAdapter = {
    pull: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return { patches: [{ op: 'replace', path: ['count'], value: 7 }] };
    },
    push: async () => ({})
  };
  const statuses: SyncStatus[] = [];
  const store = create<{ count: number }>(() => ({ count: 0 }), {
    middlewares: [
      sync({
        name: 'pull-retry',
        storage: createMemoryStorage(),
        adapter,
        onError: () => undefined,
        onStatusChange: (status) => statuses.push(status),
        retry: { initialMs: 1 }
      })
    ]
  });

  await getSyncApi(store)
    .pull()
    .catch(() => undefined);
  await waitUntil(() => attempts >= 2);

  // Retrying only the flush would find an empty outbox, report idle, and leave
  // the remote state unfetched.
  expect(attempts).toBeGreaterThanOrEqual(2);
  expect(store.getState().count).toBe(7);
  expect(statuses[statuses.length - 1]).toBe('idle');
  store.destroy();
});

test('overlapping pulls share one request rather than racing', async () => {
  let started = 0;
  let release!: (result: SyncPullResult) => void;
  const adapter: SyncAdapter = {
    pull: () => {
      started += 1;
      return new Promise<SyncPullResult>((resolve) => {
        release = resolve;
      });
    },
    push: async () => ({})
  };
  const store = create<{ count: number }>(() => ({ count: 0 }), {
    middlewares: [
      sync({ name: 'pull-race', storage: createMemoryStorage(), adapter })
    ]
  });
  await nextTick();

  const first = getSyncApi(store).pull();
  const second = getSyncApi(store).pull();
  await nextTick();

  // Two in flight have no ordering: the later response can carry the older
  // revision and overwrite the newer state with it.
  expect(started).toBe(1);
  release({ patches: [{ op: 'replace', path: ['count'], value: 3 }] });
  await Promise.all([first, second]);
  await nextTick();

  expect(store.getState().count).toBe(3);
  store.destroy();
});

test('an undo from @coaction/history is sent like any other user edit', async () => {
  const pushed: number[][] = [];
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async (mutations) => {
      pushed.push(
        mutations.flatMap((mutation) =>
          mutation.patches.map((patch) => (patch as { value: number }).value)
        )
      );
      return {};
    }
  };
  const store = create<{ count: number; increment: () => void }>(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        history(),
        sync({ name: 'undo', storage: createMemoryStorage(), adapter })
      ]
    }
  );
  await nextTick();

  store.getState().increment();
  await nextTick();
  expect(store.getState().count).toBe(1);

  (store as unknown as { history: HistoryApi<object> }).history.undo();
  await nextTick();

  // An undo is the user taking an edit back. Skipping it because the commit
  // replays patches leaves the remote holding the value they just removed.
  expect(store.getState().count).toBe(0);
  expect(pushed.flat()).toEqual([1, 0]);
  store.destroy();
});

test('a rebase is one commit, not three states subscribers can see', async () => {
  let releasePull!: (result: SyncPullResult) => void;
  const adapter: SyncAdapter = {
    pull: () =>
      new Promise<SyncPullResult>((resolve) => {
        releasePull = resolve;
      }),
    push: pendingPush
  };
  const store = create<{
    count: number;
    label: string;
    bump: () => void;
  }>(
    (set) => ({
      count: 0,
      label: 'start',
      bump() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({ name: 'atomic', storage: createMemoryStorage(), adapter })
      ]
    }
  );
  await nextTick();

  store.getState().bump();
  await nextTick();
  expect(store.getState().count).toBe(1);

  const seen: Array<{ count: number; label: string }> = [];
  store.subscribe(() => {
    const { count, label } = store.getState();
    seen.push({ count, label });
  });

  const pulled = getSyncApi(store).pull();
  await nextTick();
  releasePull({
    patches: [{ op: 'replace', path: ['label'], value: 'remote' }]
  });
  await pulled;
  await nextTick();

  // Rollback, remote and replay are three states and only the last is true.
  // Publishing the other two re-renders a tree through data that was never
  // current, including the user's own edit briefly disappearing.
  expect(seen).toEqual([{ count: 1, label: 'remote' }]);
  store.destroy();
});

test('a rebase that throws leaves the state and the outbox untouched', async () => {
  const errors: unknown[] = [];
  let releasePull!: (result: SyncPullResult) => void;
  const adapter: SyncAdapter = {
    pull: () =>
      new Promise<SyncPullResult>((resolve) => {
        releasePull = resolve;
      }),
    push: pendingPush
  };
  const store = create<{ count: number; bump: () => void }>(
    (set) => ({
      count: 0,
      bump() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'atomic-fail',
          storage: createMemoryStorage(),
          adapter,
          onError: (error) => errors.push(error)
        })
      ]
    }
  );
  await nextTick();

  store.getState().bump();
  await nextTick();
  const pendingBefore = getSyncApi(store).getPending();

  const pulled = getSyncApi(store)
    .pull()
    .catch(() => undefined);
  await nextTick();
  releasePull({
    patches: [{ op: 'replace', path: ['__proto__', 'polluted'], value: 1 }]
  });
  await pulled;
  await nextTick();

  // Failing part-way through used to leave state stripped of edits the outbox
  // still listed as pending, so the next flush sent them against a base that no
  // longer matched.
  expect(errors).toHaveLength(1);
  expect(store.getState().count).toBe(1);
  expect(getSyncApi(store).getPending()).toEqual(pendingBefore);
  store.destroy();
});

test('a remote insert moves pending array edits with the entity they named', async () => {
  let releasePull!: (result: SyncPullResult) => void;
  const adapter: SyncAdapter = {
    pull: () =>
      new Promise<SyncPullResult>((resolve) => {
        releasePull = resolve;
      }),
    push: pendingPush
  };
  const store = create<{
    items: Array<{ id: string; title: string }>;
    rename: (index: number, title: string) => void;
  }>(
    (set) => ({
      items: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' }
      ],
      rename(index, title) {
        set(() => {
          this.items[index].title = title;
        });
      }
    }),
    {
      middlewares: [
        sync({ name: 'array-shift', storage: createMemoryStorage(), adapter })
      ]
    }
  );
  await nextTick();

  store.getState().rename(1, 'edited');
  await nextTick();

  const pulled = getSyncApi(store).pull();
  await nextTick();
  releasePull({
    patches: [{ op: 'add', path: ['items', 0], value: { id: 'z', title: 'Z' } }]
  });
  await pulled;
  await nextTick();

  // The pending patch named index 1, but an index is a position and the remote
  // insert moved the entity to 2. Replaying the position edits a record the
  // user never touched, and nothing reports it.
  const byId = Object.fromEntries(
    store.getState().items.map((item) => [item.id, item.title])
  );
  expect(byId).toEqual({ z: 'Z', a: 'A', b: 'edited' });
  store.destroy();
});

test('a pull answered against a base that has since moved is not applied', async () => {
  let releasePull!: (result: SyncPullResult) => void;
  let pullCalls = 0;
  const adapter: SyncAdapter = {
    pull: () => {
      pullCalls += 1;
      if (pullCalls > 1) {
        return Promise.resolve({
          patches: [{ op: 'replace', path: ['count'], value: 30 }]
        });
      }
      return new Promise<SyncPullResult>((resolve) => {
        releasePull = resolve;
      });
    },
    push: async () => ({
      patches: [{ op: 'replace', path: ['count'], value: 20 }]
    })
  };
  const store = create<{ count: number; bump: () => void }>(
    (set) => ({
      count: 0,
      bump() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    {
      middlewares: [
        sync({ name: 'stale-pull', storage: createMemoryStorage(), adapter })
      ]
    }
  );
  await nextTick();

  const pulled = getSyncApi(store).pull();
  await nextTick();

  // A push lands while the pull is still out, moving the state past the base
  // the pull was computed against.
  store.getState().bump();
  await nextTick();
  expect(store.getState().count).toBe(20);

  releasePull({ patches: [{ op: 'replace', path: ['count'], value: 10 }] });
  await pulled;
  await nextTick();

  // Applying the stale answer would rewind 20 to 10 with both requests having
  // succeeded, so it is discarded and the pull is asked again.
  expect(store.getState().count).toBe(30);
  expect(pullCalls).toBeGreaterThan(1);
  store.destroy();
});
