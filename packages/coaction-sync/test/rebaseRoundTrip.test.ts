import { create } from 'coaction';
import { getSyncApi, sync, type SyncAdapter, type SyncStorage } from '../src';

/**
 * The rebase composes everything: it rolls pending mutations back through their
 * inverses, applies the remote's patches, and replays what survived -- moving
 * array indexes to follow the records they named as it goes.
 *
 * Each of those is tested on its own. This runs generated local sequences
 * against a remote insert that shifts every index, and asserts what the rebase
 * promises: the remote's record arrives exactly once, at the front, and every
 * pending mutation is still pending afterwards.
 */
const nextTick = async () => {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
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
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

test('a remote insert lands once and leaves the outbox intact', async () => {
  for (let seed = 1; seed <= 120; seed += 1) {
    const random = seeded(seed);
    let emit: ((update: { patches: unknown }) => void) | undefined;
    const adapter: SyncAdapter = {
      pull: async () => ({}),
      // Held, so every local mutation is still pending when the remote arrives.
      push: () => new Promise<never>(() => undefined),
      subscribe: (listener) => {
        emit = listener as never;
      }
    };
    const store = create<any>(
      (set: any) => ({
        items: [
          { id: 'a', v: 1 },
          { id: 'b', v: 2 }
        ],
        n: 0,
        act(kind: number, value: number) {
          set(() => {
            const self = this as any;
            if (kind === 0) self.n = value;
            else if (kind === 1) self.items.push({ id: `x${value}`, v: value });
            else if (kind === 2 && self.items.length) self.items[0].v = value;
            else if (kind === 3 && self.items.length > 1) self.items.pop();
            else self.items.unshift({ id: `u${value}`, v: value });
          });
        }
      }),
      {
        middlewares: [
          sync({
            name: `rebase-${seed}`,
            storage: createMemoryStorage(),
            adapter
          })
        ]
      }
    );
    await nextTick();

    const steps = 1 + Math.floor(random() * 3);
    for (let step = 0; step < steps; step += 1) {
      store.getState().act(Math.floor(random() * 5), Math.floor(random() * 9));
    }
    await nextTick();
    const pending = getSyncApi(store).getPending().length;

    emit!({
      patches: [{ op: 'add', path: ['items', 0], value: { id: 'r', v: 99 } }]
    });
    await nextTick();

    const items = (store.getPureState() as any).items as { id: string }[];
    expect(items[0]?.id).toBe('r');
    expect(items.filter((item) => item.id === 'r')).toHaveLength(1);
    expect(getSyncApi(store).getPending()).toHaveLength(pending);
    store.destroy();
  }
}, 30_000);
