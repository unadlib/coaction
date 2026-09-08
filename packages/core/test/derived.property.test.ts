import { derive, derivePath } from 'coaction/derived';
import { onStoreCommit, replayStorePatches } from 'coaction/adapter';
import { createStore } from '../src/storeFactory';
import { forEachSeed } from './random';

type Data = {
  rows: Array<{ n: number; label: string }>;
  selected: number;
  dict: Record<string, number>;
};
const project = (s: Data) =>
  `${s.rows[s.selected]?.n}:${s.rows.length}:${s.rows.reduce((sum, row) => sum + row.n, 0)}:${Object.keys(s.dict).join(',')}:${'x' in s.dict}:${s.dict.x}`;

test('cached derived values equal fresh evaluation across mixed writes and rollbacks', () => {
  forEachSeed(40, (random) => {
    let expected: Data = {
      rows: [
        { n: 1, label: 'a' },
        { n: 2, label: 'b' }
      ],
      selected: 0,
      dict: {}
    };
    const { store, internal } = createStore(structuredClone(expected), {});
    const deep = derive(store, project, { deep: true });
    const conservative = derive(store, project);
    const path = derivePath(store, ['rows', 0, 'n']);
    const row = derive(
      store,
      (s) => ({ row: s.rows[s.selected], label: s.rows[s.selected]?.label }),
      { deep: true }
    );
    let commits = 0;
    onStoreCommit(store, () => {
      commits++;
    });
    try {
      for (let step = 0; step < 50; step++) {
        const check = () => {
          expect(deep()).toBe(project(expected));
          expect(conservative()).toBe(project(expected));
          expect(path()).toBe(expected.rows[0]?.n);
          expect(row().row).toBe(store.getState().rows[expected.selected]);
          expect(row().row?.n).toBe(expected.rows[expected.selected]?.n);
        };
        check();
        const before = structuredClone(expected);
        const value = random.integer(-20, 20);
        const kind = random.integer(0, 6);
        const recipe = (s: Data) => {
          if (kind === 0 && s.rows.length) s.rows[0].n = value;
          else if (kind === 1) s.rows.reverse();
          else if (kind === 2) s.rows.splice(0, 1, { n: value, label: 'new' });
          else if (kind === 3) s.rows.length = Math.min(s.rows.length, 1);
          else if (kind === 4) {
            const captured = s.rows[1];
            s.rows.unshift({ n: value, label: 'head' });
            if (captured) captured.n = value + 1;
          } else if (kind === 5) {
            if ('x' in s.dict) delete s.dict.x;
            else s.dict.x = value;
          } else s.selected = Math.abs(value) % 4;
        };
        recipe(expected);
        if (step % 7 === 0) {
          const count = commits;
          expect(() =>
            store.setState((s) => {
              recipe(s);
              expect(deep()).toBe(project(expected));
              throw new Error('rollback');
            })
          ).toThrow('rollback');
          expected = before;
          expect(commits).toBe(count);
        } else if (step % 4 === 0) store.setState(recipe);
        else if (step % 4 === 1) store.setState(structuredClone(expected));
        else if (step % 4 === 2)
          store.apply(store.getPureState(), [
            { op: 'replace', path: [], value: structuredClone(expected) }
          ]);
        else
          replayStorePatches(store, {
            patches: [
              { op: 'replace', path: [], value: structuredClone(expected) }
            ],
            inversePatches: [{ op: 'replace', path: [], value: before }]
          });
        check();
      }
    } finally {
      deep.dispose();
      conservative.dispose();
      path.dispose();
      row.dispose();
      expect(internal.reactivePathActiveCount).toBe(0);
      store.destroy();
    }
  });
}, 600000);
