import { create } from 'coaction';
import { sync, type SyncAdapter, type SyncStorage } from '../src';

const nextTick = async () => {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const adapter: SyncAdapter = { pull: async () => ({}), push: async () => ({}) };
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

test('state JSON cannot represent is refused rather than quietly rewritten', () => {
  // A Date round-trips through JSON as a string, so the store would come back
  // from a restart with a different type and nothing would have said so.
  expect(() =>
    create<{ stamp: Date }>(
      () => ({ stamp: new Date('2026-01-01T00:00:00.000Z') }),
      {
        middlewares: [
          sync({ name: 'json-date', storage: createMemoryStorage(), adapter })
        ]
      }
    )
  ).toThrow(/stores state as JSON.*stamp/s);

  // A Map does not round-trip at all: it comes back `{}`.
  expect(() =>
    create<{ index: Map<string, number> }>(
      () => ({ index: new Map([['a', 1]]) }),
      {
        middlewares: [
          sync({ name: 'json-map', storage: createMemoryStorage(), adapter })
        ]
      }
    )
  ).toThrow(/stores state as JSON.*index/s);
});

test('a value introduced after the store was built is refused, not stored', async () => {
  const errors: unknown[] = [];
  const store = create<{ stamp: string | Date; set: () => void }>(
    (set) => ({
      stamp: '',
      set() {
        set(() => {
          this.stamp = new Date('2026-01-01T00:00:00.000Z');
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'json-later',
          storage: createMemoryStorage(),
          adapter,
          onError: (error) => errors.push(error)
        })
      ]
    }
  );
  await nextTick();

  // The startup check cannot see this one. The transition is refused before it
  // is committed, so the error reaches the caller and the store keeps the
  // value it could carry.
  expect(() => store.getState().set()).toThrow(/stores state as JSON/);
  await nextTick();
  expect(store.getState().stamp).toBe('');
  expect(errors).toHaveLength(0);
  store.destroy();
});

test('a value JSON cannot encode is refused at the write that makes it', async () => {
  const errors: unknown[] = [];
  const store = create<{ big: number | bigint; set: () => void }>(
    (set) => ({
      big: 0,
      set() {
        set(() => {
          this.big = 1n;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'json-bigint',
          storage: createMemoryStorage(),
          adapter,
          onError: (error) => errors.push(error)
        })
      ]
    }
  );
  await nextTick();

  // The check used to run after the commit, which left only two bad options:
  // throw out of a `set()` whose write had already landed, or report the error
  // to `onError` and leave the store holding a value it can never sync. It now
  // runs before the commit, where refusing costs nothing.
  expect(() => store.getState().set()).toThrow(/stores state as JSON/);
  await nextTick();
  expect(store.getState().big).toBe(0);
  expect(errors).toHaveLength(0);
  store.destroy();
});
