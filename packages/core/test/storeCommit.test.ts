import { create, type Middleware, type Store } from '../src';
import {
  onStoreCommit,
  onStoreCommitPrepare,
  onStoreCommitValidate,
  replayStorePatches,
  type StoreCommit
} from '../adapter';

type Counter = {
  count: number;
  increment: () => void;
  noop: () => void;
};

const createCounter = (
  middlewares: Middleware<Counter>[],
  enablePatches = false
) =>
  create<Counter>(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      noop() {
        set((draft) => {
          draft.count += 0;
        });
      }
    }),
    {
      enablePatches,
      middlewares
    }
  );

test('commit observers request exact patch pairs without enablePatches', () => {
  const commits: StoreCommit<Counter>[] = [];
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = createCounter([observe]);

  store.getState().increment();

  expect(commits).toHaveLength(1);
  expect(commits[0]).toMatchObject({
    source: 'setState',
    patches: [{ op: 'replace', path: ['count'], value: 1 }],
    inversePatches: [{ op: 'replace', path: ['count'], value: 0 }]
  });
  expect(commits[0].state).toBe(store.getPureState());

  store.getState().noop();
  expect(commits).toHaveLength(1);
});

test('commit observer cleanup is idempotent', () => {
  const listener = jest.fn();
  let unsubscribe = () => {};
  const observe: Middleware<Counter> = (store) => {
    unsubscribe = onStoreCommit(store, listener);
    return store;
  };
  const store = createCounter([observe]);

  unsubscribe();
  unsubscribe();
  store.getState().increment();

  expect(listener).not.toHaveBeenCalled();
});

test('direct root replacements publish patch pairs without wrapping apply', () => {
  const commits: StoreCommit<Counter>[] = [];
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = createCounter([observe]);
  const originalApply = store.apply;

  store.apply({ count: 5 } as Counter);

  expect(store.apply).toBe(originalApply);
  expect(store.getState().count).toBe(5);
  expect(commits).toHaveLength(1);
  expect(commits[0]).toMatchObject({
    source: 'external',
    patches: [{ op: 'replace', path: ['count'], value: 5 }],
    inversePatches: [{ op: 'replace', path: ['count'], value: 0 }]
  });
});

test.each(['object', 'recipe'] as const)(
  'commit observers preserve cyclic and shared references from %s updates',
  (updateKind) => {
    type GraphState = {
      value: Record<string, unknown> | null;
      setValue: (value: Record<string, unknown>) => void;
    };
    const commits: StoreCommit<GraphState>[] = [];
    const observe: Middleware<GraphState> = (store) => {
      onStoreCommit(store, (commit) => commits.push(commit));
      onStoreCommitPrepare(store, () => true);
      return store;
    };
    const store = create<GraphState>(
      (set) => ({
        value: null,
        setValue(value) {
          if (updateKind === 'object') {
            set({ value });
            return;
          }
          set((draft) => {
            draft.value = value;
          });
        }
      }),
      { middlewares: [observe] }
    );
    const shared: Record<string, unknown> = { label: 'shared' };
    const graph: Record<string, unknown> = {
      left: shared,
      right: shared
    };
    graph.self = graph;

    expect(() => store.getState().setValue(graph)).not.toThrow();

    const value = store.getPureState().value!;
    expect(value.self).toBe(value);
    expect(value.left).toBe(value.right);
    expect(commits).toHaveLength(1);
    expect(commits[0].source).toBe('setState');
    expect(commits[0].state).toBe(store.getPureState());
  }
);

test('replacement commit patches retain aliases across root values', () => {
  type SharedState = {
    left: Record<string, unknown> | null;
    right: Record<string, unknown> | null;
  };
  const commits: StoreCommit<SharedState>[] = [];
  const observe: Middleware<SharedState> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = create<SharedState>(() => ({ left: null, right: null }), {
    middlewares: [observe]
  });
  const shared = { label: 'shared' };

  store.apply({ left: shared, right: shared });

  const values = commits[0].patches.map((patch) => patch.value);
  expect(values).toHaveLength(2);
  expect(values[0]).toBe(values[1]);
});

test('replays patches through middleware and publishes the committed result', () => {
  const commits: StoreCommit<Counter>[] = [];
  const patch = jest.fn((transition: any) => transition);
  const patchMiddleware: Middleware<Counter> = (store) => {
    store.patch = patch;
    return store;
  };
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = createCounter([patchMiddleware, observe]);

  store.getState().increment();
  const increment = commits[0];
  patch.mockClear();

  const replayed = replayStorePatches(store, {
    patches: increment.inversePatches,
    inversePatches: increment.patches
  });

  expect(replayed).toBe(store.getPureState());
  expect(store.getState().count).toBe(0);
  expect(patch).toHaveBeenCalledTimes(1);
  expect(commits[commits.length - 1]).toMatchObject({
    source: 'replay',
    patches: [{ op: 'replace', path: ['count'], value: 0 }],
    inversePatches: [{ op: 'replace', path: ['count'], value: 1 }]
  });
});

test('replay can enter through a middleware-scoped setState wrapper', () => {
  const commits: StoreCommit<Counter>[] = [];
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = createCounter([observe]);
  store.getState().increment();
  const increment = commits[0];
  const scopedSetState = jest.fn(store.setState);

  replayStorePatches(
    store,
    {
      patches: increment.inversePatches,
      inversePatches: increment.patches
    },
    { setState: scopedSetState }
  );

  expect(scopedSetState).toHaveBeenCalledTimes(1);
  expect(store.getState().count).toBe(0);
});

test('replay does not expose retained patch objects to patch middleware', () => {
  let replaying = false;
  const patchMiddleware: Middleware<Counter> = (store) => {
    store.patch = (transition) => {
      if (replaying) {
        (transition.patches[0] as { value: number }).value = 7;
      }
      return transition;
    };
    return store;
  };
  let sourceStore: Store<Counter> | undefined;
  let increment: StoreCommit<Counter> | undefined;
  const observe: Middleware<Counter> = (store) => {
    sourceStore = store;
    onStoreCommit(store, (commit) => {
      if (commit.source === 'setState') {
        increment = commit;
      }
    });
    return store;
  };
  const store = createCounter([patchMiddleware, observe]);
  store.getState().increment();

  const retainedInverse = increment!.inversePatches;
  replaying = true;
  replayStorePatches(sourceStore!, {
    patches: retainedInverse,
    inversePatches: increment!.patches
  });

  expect(store.getState().count).toBe(7);
  expect((retainedInverse[0] as { value: number }).value).toBe(0);
});

test('rejected replay leaves state and commit stream unchanged', () => {
  const listener = jest.fn();
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, listener);
    return store;
  };
  const store = createCounter([observe]);

  expect(() =>
    replayStorePatches(store, {
      patches: [{ op: 'add', path: ['unknown'], value: 1 }],
      inversePatches: [{ op: 'remove', path: ['unknown'] }]
    })
  ).toThrow(/Unknown state key 'unknown'/);

  expect(store.getState().count).toBe(0);
  expect(listener).not.toHaveBeenCalled();
});

test('destroy releases commit observers and the patch replayer', () => {
  const listener = jest.fn();
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, listener);
    return store;
  };
  const store = createCounter([observe]);

  store.destroy();

  expect(() =>
    replayStorePatches(store, { patches: [], inversePatches: [] })
  ).toThrow('replayStorePatches() requires a store created by Coaction.');
  expect(listener).not.toHaveBeenCalled();
});

/**
 * `onStoreCommitValidate` promises a validator the commit a listener will get.
 * It was given the patches and a guess at everything else: the source was read
 * off the store at the commit point, where nothing had said what the transition
 * was, so every one of them looked `external` while the listener for the same
 * commit was told `setState` or `replay`. A validator deciding by source --
 * ignoring a replay, treating an external write differently -- was deciding on
 * the wrong answer.
 */
test('a validator is told the same thing about a commit as a listener', () => {
  const store = create<{ count: number; increment: () => void }>((set) => ({
    count: 0,
    increment() {
      set(() => {
        this.count += 1;
      });
    }
  }));
  const validated: StoreCommit[] = [];
  const committed: StoreCommit[] = [];
  onStoreCommitValidate(store, (commit) => validated.push(commit));
  onStoreCommit(store, (commit) => committed.push(commit));

  store.getState().increment();
  store.setState({ count: 20 });
  store.apply({ ...store.getPureState(), count: 30 });
  replayStorePatches(store, {
    patches: [{ op: 'replace', path: ['count'], value: 50 }],
    inversePatches: [{ op: 'replace', path: ['count'], value: 30 }]
  });

  expect(validated).toHaveLength(committed.length);
  expect(validated.map(({ source }) => source)).toEqual([
    'setState',
    'setState',
    'external',
    'replay'
  ]);
  validated.forEach((commit, index) => {
    expect(commit.source).toBe(committed[index].source);
    expect(commit.patches).toEqual(committed[index].patches);
    expect(commit.inversePatches).toEqual(committed[index].inversePatches);
  });
  store.destroy();
});
