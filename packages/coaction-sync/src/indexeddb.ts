import type { SyncStorage } from './index';

export type IndexedDbSyncStorageOptions = {
  /** Database name. Defaults to `coaction-sync`. */
  database?: string;
  /** Object store name. Defaults to `state`. */
  store?: string;
  /**
   * The IndexedDB implementation to use. Defaults to `globalThis.indexedDB`,
   * which is what a browser provides; pass one explicitly under a test double
   * or a non-browser runtime.
   */
  indexedDB?: IDBFactory;
};

const request = <T>(source: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () =>
      reject(source.error ?? new Error('IndexedDB request failed'));
  });

/**
 * Durable storage for `sync()` backed by IndexedDB.
 *
 * `localStorage` is the default because it needs no setup, but it is
 * synchronous, capped near 5 MB, and shared with everything else on the origin.
 * A local-first store that holds real documents outgrows it. IndexedDB is
 * asynchronous, which `SyncStorage` already allows for.
 *
 * ```ts
 * import { sync } from '@coaction/sync';
 * import { createIndexedDbSyncStorage } from '@coaction/sync/indexeddb';
 *
 * sync({
 *   name: 'todos',
 *   adapter,
 *   storage: createIndexedDbSyncStorage({ database: 'my-app' })
 * });
 * ```
 *
 * The connection is opened once, lazily, on the first read or write, and every
 * later call reuses it. A failed open rejects that call and is retried by the
 * next one rather than being cached as a permanent failure -- a database
 * blocked by another tab's upgrade should not disable persistence for the rest
 * of the session.
 */
export const createIndexedDbSyncStorage = ({
  database = 'coaction-sync',
  store: storeName = 'state',
  indexedDB = globalThis.indexedDB
}: IndexedDbSyncStorageOptions = {}): SyncStorage => {
  let connection: Promise<IDBDatabase> | undefined;

  const openDatabase = (version?: number) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const opening =
        version === undefined
          ? indexedDB.open(database)
          : indexedDB.open(database, version);
      opening.onupgradeneeded = () => {
        if (!opening.result.objectStoreNames.contains(storeName)) {
          opening.result.createObjectStore(storeName);
        }
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () =>
        reject(opening.error ?? new Error('IndexedDB open failed'));
      opening.onblocked = () =>
        reject(
          new Error(
            `IndexedDB database '${database}' is blocked by another connection.`
          )
        );
    });

  const openWithStore = async () => {
    if (!indexedDB) {
      throw new Error(
        'createIndexedDbSyncStorage() found no IndexedDB implementation. Pass one as `indexedDB`.'
      );
    }
    let opened = await openDatabase();
    // Opening at the current version never runs an upgrade, so a store name
    // this database has not seen before -- a second storage sharing it, or a
    // name added in a later release -- has to bump the version to create it.
    if (!opened.objectStoreNames.contains(storeName)) {
      const version = opened.version + 1;
      opened.close();
      opened = await openDatabase(version);
    }
    // Another connection upgrading must not leave this one holding a handle it
    // will be blocked on; drop it and let the next call open again.
    opened.onversionchange = () => {
      opened.close();
      connection = undefined;
    };
    return opened;
  };

  const open = () => {
    if (connection) return connection;
    connection = openWithStore().catch((error) => {
      // Let the next call try again instead of caching the failure forever.
      connection = undefined;
      throw error;
    });
    return connection;
  };

  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    const opened = await open();
    const transaction = opened.transaction(storeName, mode);
    const result = request(run(transaction.objectStore(storeName)));
    return new Promise<T>((resolve, reject) => {
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      result.then(resolve, reject);
    });
  };

  return {
    async getItem(name) {
      const value = await withStore<unknown>('readonly', (store) =>
        store.get(name)
      );
      return typeof value === 'string' ? value : null;
    },
    async setItem(name, value) {
      await withStore('readwrite', (store) => store.put(value, name));
    },
    async removeItem(name) {
      await withStore('readwrite', (store) => store.delete(name));
    }
  };
};
