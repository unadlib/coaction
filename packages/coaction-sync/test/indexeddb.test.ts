import { IDBFactory } from 'fake-indexeddb';
import { create } from 'coaction';
import { createIndexedDbSyncStorage } from '../src/indexeddb';
import { getSyncApi, sync, type SyncAdapter } from '../src';

const nextTick = async () => {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const pendingPush = () => new Promise<never>(() => undefined);

/**
 * IndexedDB resolves on its own event-loop turns, so a fixed number of ticks is
 * a guess about when a write landed. Wait for the durable state instead.
 */
const waitUntil = async (ready: () => Promise<boolean>, what: string) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
};

test('round-trips values and reports a missing key as null', async () => {
  const storage = createIndexedDbSyncStorage({ indexedDB: new IDBFactory() });

  expect(await storage.getItem('absent')).toBeNull();
  await storage.setItem('a', 'first');
  expect(await storage.getItem('a')).toBe('first');

  await storage.setItem('a', 'second');
  expect(await storage.getItem('a')).toBe('second');

  await storage.removeItem('a');
  expect(await storage.getItem('a')).toBeNull();
});

test('keeps separate databases and object stores apart', async () => {
  const indexedDB = new IDBFactory();
  const one = createIndexedDbSyncStorage({ indexedDB, database: 'one' });
  const two = createIndexedDbSyncStorage({ indexedDB, database: 'two' });
  const otherStore = createIndexedDbSyncStorage({
    indexedDB,
    database: 'one',
    store: 'other'
  });

  await one.setItem('k', 'from-one');
  await two.setItem('k', 'from-two');

  expect(await one.getItem('k')).toBe('from-one');
  expect(await two.getItem('k')).toBe('from-two');
  // A different object store in the same database is a different namespace.
  expect(await otherStore.getItem('k')).toBeNull();
});

test('survives a reopened connection, which is what a reload is', async () => {
  const indexedDB = new IDBFactory();
  const first = createIndexedDbSyncStorage({ indexedDB, database: 'reload' });
  await first.setItem('doc', '{"count":3}');

  const second = createIndexedDbSyncStorage({ indexedDB, database: 'reload' });
  expect(await second.getItem('doc')).toBe('{"count":3}');
});

test('explains itself when no IndexedDB implementation is available', async () => {
  const storage = createIndexedDbSyncStorage({
    indexedDB: undefined as unknown as IDBFactory
  });
  await expect(storage.getItem('a')).rejects.toThrow(
    /no IndexedDB implementation/
  );
});

test('a failed open is retried rather than cached as permanent', async () => {
  const real = new IDBFactory();
  let failNext = true;
  const flaky = {
    open: ((...args: Parameters<IDBFactory['open']>) => {
      if (failNext) {
        failNext = false;
        throw new Error('open failed');
      }
      return real.open(...args);
    }) as IDBFactory['open']
  } as IDBFactory;

  const storage = createIndexedDbSyncStorage({
    indexedDB: flaky,
    database: 'flaky'
  });
  await expect(storage.getItem('a')).rejects.toThrow('open failed');

  // The next call opens again instead of replaying the cached rejection.
  await storage.setItem('a', 'recovered');
  expect(await storage.getItem('a')).toBe('recovered');
});

test('sync() persists its snapshot and outbox through IndexedDB', async () => {
  const indexedDB = new IDBFactory();
  const adapter: SyncAdapter = { pull: async () => ({}), push: pendingPush };
  const storage = createIndexedDbSyncStorage({ indexedDB, database: 'store' });

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
      { middlewares: [sync({ name: 'counter', storage, adapter })] }
    );

  const first = createCounter();
  await nextTick();
  first.getState().increment();
  expect(getSyncApi(first).getPending()).toHaveLength(1);
  await waitUntil(async () => {
    const raw = await storage.getItem('counter');
    return raw !== null && JSON.parse(raw).state?.count === 1;
  }, 'the first store to reach IndexedDB');
  first.destroy();

  // A fresh store over the same database is the reload case.
  const second = createCounter();
  await waitUntil(
    async () => second.getState().count === 1,
    'the second store to hydrate'
  );
  expect(second.getState().count).toBe(1);
  expect(getSyncApi(second).getPending()).toHaveLength(1);
  second.destroy();
});
