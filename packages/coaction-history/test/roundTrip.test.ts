import { create } from 'coaction';
import { history } from '../src';

/**
 * The whole chain, end to end: a draft produces patches and inverses, history
 * stores them, and undo and redo apply them back through the patch runtime.
 *
 * Each piece is fuzzed on its own. This is the only place their composition is,
 * and composition is where an inverse that is subtly wrong stops being subtle:
 * undoing everything has to reach exactly the state the store started in.
 */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

test('undoing every action returns to the state the store started in', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const random = seeded(seed);
    const store = create<any>(
      (set: any) => ({
        n: 0,
        xs: [1, 2, 3],
        nested: { v: 1, tags: ['a'] },
        act(kind: number, value: number) {
          set(() => {
            const self = this as any;
            if (kind === 0) self.n = value;
            else if (kind === 1) self.xs.push(value);
            else if (kind === 2) self.xs.pop();
            else if (kind === 3) self.nested.v = value;
            else if (kind === 4) self.xs.splice(0, 1, value);
            else if (kind === 5) self.xs.unshift(value);
            else if (kind === 6) self.xs.reverse();
            else self.nested.tags.push(String(value));
          });
        }
      }),
      { middlewares: [history()] }
    );
    const api = (store as any).history;
    const initial = JSON.stringify(store.getPureState());

    const steps = 3 + Math.floor(random() * 5);
    for (let step = 0; step < steps; step += 1) {
      store.getState().act(Math.floor(random() * 8), Math.floor(random() * 9));
    }
    const finished = JSON.stringify(store.getPureState());

    while (api.canUndo()) api.undo();
    expect(JSON.stringify(store.getPureState())).toBe(initial);

    while (api.canRedo()) api.redo();
    expect(JSON.stringify(store.getPureState())).toBe(finished);

    store.destroy();
  }
}, 30_000);
