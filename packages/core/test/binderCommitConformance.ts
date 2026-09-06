import { apply as applyPatches } from 'mutative';
import { describe, expect, test } from 'vitest';
import { onStoreCommit, type StoreCommit } from '../adapter';
import type { Store } from '../src';

/**
 * One claim, asserted for every official binder:
 *
 *     initial state + every commit's patches === the state the store holds
 *
 * The invariant suites for the mutable adapters check it over actions. This
 * checks it over the entries that do not go through an action at all, and it
 * runs for binders of both kinds -- the ones that replace `store.apply` with a
 * writer for their own runtime, and the ones that leave it alone.
 *
 * That distinction is exactly what made this necessary. Core wraps a replaced
 * `apply` to put it back on the commit pipeline, and it was doing so for every
 * binder: the ones that had not replaced it ended up with the pipeline in front
 * of itself, publishing and validating each transition twice. Every adapter the
 * invariant suites covered happened to be one that replaces it.
 */
export type BinderCommitContract = {
  packageName: string;
  /** A store over `{ count, label }`, built through this package's binder. */
  createStore: () => {
    store: Store<{ count: number; label: string }>;
    cleanup?: () => void;
  };
  /**
   * The binder refuses a direct `store.apply`, because its runtime only accepts
   * changes through its own channel -- XState, where state moves by sending the
   * actor an event. Refusing is a conformance claim of its own: what it must
   * not do is take the write and keep it out of the commit stream.
   */
  refusesDirectApply?: boolean;
};

export const runBinderCommitConformance = ({
  packageName,
  createStore,
  refusesDirectApply
}: BinderCommitContract) => {
  describe(`${packageName} commit conformance`, () => {
    if (refusesDirectApply) {
      test('a direct apply is refused, and changes nothing', () => {
        const { store, cleanup } = createStore();
        const before = JSON.parse(JSON.stringify(store.getPureState()));
        const commits: StoreCommit[] = [];
        onStoreCommit(store, (commit) => commits.push(commit));

        expect(() =>
          store.apply(store.getPureState(), [
            { op: 'replace', path: ['count'], value: 7 }
          ])
        ).toThrow();
        expect(() =>
          store.apply({ ...store.getPureState(), label: 'b' })
        ).toThrow();

        expect(() =>
          store.apply({ ...store.getPureState(), count: 99 }, [
            { op: 'replace', path: ['label'], value: 'b' }
          ])
        ).toThrow();

        expect(store.getPureState()).toEqual(before);
        expect(commits).toHaveLength(0);
        store.destroy();
        cleanup?.();
      });
      return;
    }

    const withStore = (
      run: (
        store: Store<{ count: number; label: string }>,
        commits: StoreCommit[]
      ) => void
    ) => {
      const { store, cleanup } = createStore();
      const initial = JSON.parse(JSON.stringify(store.getPureState()));
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => commits.push(commit));
      run(store, commits);
      expect(
        commits.reduce(
          (state, commit) => applyPatches(state, commit.patches),
          initial as object
        )
      ).toEqual(store.getPureState());
      store.destroy();
      cleanup?.();
    };

    test('a patch pair through apply is published once', () => {
      withStore((store, commits) => {
        store.apply(store.getPureState(), [
          { op: 'replace', path: ['count'], value: 7 }
        ]);
        expect(store.getState().count).toBe(7);
        expect(commits).toHaveLength(1);
      });
    });

    test('a replacement through apply is published once', () => {
      withStore((store, commits) => {
        store.apply({ ...store.getPureState(), label: 'b' });
        expect(store.getState().label).toBe('b');
        expect(commits).toHaveLength(1);
      });
    });

    test('apply with patches refuses a base that is not the current state', () => {
      // A patch pair describes a change to the state the store holds. Given a
      // different base it still applies and the commit still says what the pair
      // says, so the store lands somewhere its own commits do not lead. The
      // rule lived past the point where `apply` branches to an adapter's
      // writer, so a store built through one took the wrong base without a
      // word.
      const { store, cleanup } = createStore();
      const before = JSON.parse(JSON.stringify(store.getPureState()));
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => commits.push(commit));

      expect(() =>
        store.apply({ ...store.getPureState(), count: 99 }, [
          { op: 'replace', path: ['label'], value: 'b' }
        ])
      ).toThrow(/must be given the current state/);

      expect(store.getPureState()).toEqual(before);
      expect(commits).toHaveLength(0);
      store.destroy();
      cleanup?.();
    });

    test('middleware that wraps apply still runs', () => {
      // `store.apply` belongs to Coaction for every binder now, so a wrapper
      // middleware put there survives. When an adapter replaced `apply`
      // outright it discarded the wrapper without a word, because middleware
      // runs first.
      const { store, cleanup } = createStore();
      const wrapped: number[] = [];
      const inner = store.apply;
      store.apply = ((state?: unknown, patches?: unknown) => {
        wrapped.push(1);
        return (inner as (...args: unknown[]) => void)(state, patches);
      }) as typeof store.apply;
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => commits.push(commit));

      store.apply(store.getPureState(), [
        { op: 'replace', path: ['count'], value: 3 }
      ]);

      expect(wrapped).toHaveLength(1);
      expect(commits).toHaveLength(1);
      expect(store.getState().count).toBe(3);
      store.destroy();
      cleanup?.();
    });

    test('a sequence of both forms replays to the state it produced', () => {
      withStore((store, commits) => {
        store.apply(store.getPureState(), [
          { op: 'replace', path: ['count'], value: 1 }
        ]);
        store.apply({ ...store.getPureState(), label: 'c' });
        store.apply(store.getPureState(), [
          { op: 'replace', path: ['count'], value: 2 }
        ]);
        expect(commits).toHaveLength(3);
      });
    });
  });
};
