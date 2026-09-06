import type { SyncStorage } from './types';

export const createMemoryStorage = (): SyncStorage => {
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

/**
 * A worker, a Node process and an SSR render all lack `localStorage`, and the
 * default storage used to no-op there. The outbox then lived only in memory
 * while every comment and guarantee around it said "durable" -- a crash lost
 * exactly the writes the outbox exists to survive, silently. Running without
 * durability is a decision the caller makes, not one taken on their behalf.
 */
export const resolveStorage = (
  storage: SyncStorage | false | undefined,
  name: string
): SyncStorage => {
  if (storage) return storage;
  if (storage === false) return createMemoryStorage();
  if (typeof localStorage === 'undefined') {
    throw new Error(
      `sync({ name: '${name}' }) has no localStorage to write to. Pass a storage, or storage: false to accept an outbox that does not survive the process.`
    );
  }
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    }
  };
};
