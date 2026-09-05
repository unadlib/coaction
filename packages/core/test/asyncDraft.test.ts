import { create } from '../index';

/**
 * An asynchronous action holds its draft across an await, so the draft outlives
 * the call that opened it -- the one shape the generated draft suites cannot
 * reach, because they run a recipe and finalize it in the same breath.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

test('writes on either side of an await land in one state', async () => {
  const store = create<any>((set: any) => ({
    n: 0,
    async bump() {
      set(() => {
        (this as any).n += 1;
      });
      await tick();
      set(() => {
        (this as any).n += 1;
      });
    }
  }));
  await store.getState().bump();
  expect(store.getState().n).toBe(2);
  store.destroy();
});

test('overlapping actions do not lose each other', async () => {
  const store = create<any>((set: any) => ({
    a: 0,
    b: 0,
    async one() {
      set(() => {
        (this as any).a = 1;
      });
      await tick();
      set(() => {
        (this as any).a = 2;
      });
    },
    async two() {
      set(() => {
        (this as any).b = 1;
      });
      await tick();
      set(() => {
        (this as any).b = 2;
      });
    }
  }));
  await Promise.all([store.getState().one(), store.getState().two()]);
  expect(store.getState()).toMatchObject({ a: 2, b: 2 });
  store.destroy();
});

test('an action that throws keeps what it had already committed', async () => {
  const store = create<any>((set: any) => ({
    n: 0,
    async boom() {
      set(() => {
        (this as any).n = 1;
      });
      await tick();
      throw new Error('failed');
    }
  }));
  await store
    .getState()
    .boom()
    .catch(() => undefined);
  expect(store.getState().n).toBe(1);
  store.destroy();
});

test('generated asynchronous sequences leave the initial objects alone', async () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = seeded(seed);
    const held = { v: 1 };
    const items = [{ id: 0 }];
    const store = create<any>((set: any) => ({
      n: 0,
      held,
      xs: items,
      step(kind: number, value: number) {
        set(() => {
          const self = this as any;
          if (kind === 0) self.n = value;
          else if (kind === 1) self.held.v = value;
          else if (kind === 2) self.xs.push({ id: value });
          else if (kind === 3 && self.xs.length > 1) self.xs.pop();
          else self.xs.splice(0, 1, { id: value });
        });
      },
      async run(plan: number[][]) {
        for (const [kind, value] of plan) {
          this.step(kind, value);
          await tick();
        }
      }
    }));
    const plan = Array.from({ length: 1 + Math.floor(random() * 4) }, () => [
      Math.floor(random() * 5),
      Math.floor(random() * 9)
    ]);
    await store.getState().run(plan);
    // The objects the store was built from are the base, and no amount of
    // writing across awaits may reach them.
    expect(held.v).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(0);
    store.destroy();
  }
}, 30_000);
