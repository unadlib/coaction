import { create, effect, type Store } from '../src';
import {
  onStoreCommit,
  replayStorePatches,
  type StoreCommit
} from '../src/storeCommit';
import { applyPatches } from '../src/utils';
import { createStore } from '../src/storeFactory';
import { history, type HistoryApi } from '@coaction/history';
import { getSyncApi, sync } from '@coaction/sync';

const writes = {
  object: (store: Store<{ count: number }>, count: number) =>
    store.setState({ count }),
  recipe: (store: Store<{ count: number }>, count: number) =>
    store.setState((state) => {
      state.count = count;
    }),
  apply: (store: Store<{ count: number }>, count: number) =>
    store.apply({ count }),
  patches: (store: Store<{ count: number }>, count: number) =>
    store.apply(store.getPureState(), [
      { op: 'replace', path: ['count'], value: count }
    ]),
  replay: (store: Store<{ count: number }>, count: number) =>
    replayStorePatches(store, {
      patches: [{ op: 'replace', path: ['count'], value: count }],
      inversePatches: [
        { op: 'replace', path: ['count'], value: store.getPureState().count }
      ]
    })
};

test('direct apply emits transport updates without requiring a commit listener', () => {
  const { store, internal } = createStore({ count: 0 }, {});
  const seen: unknown[] = [];
  internal.emitPatches = (patches) => {
    seen.push(applyPatches({ count: 0 }, patches));
  };
  store.apply({ count: 1 });
  expect(seen).toEqual([{ count: 1 }]);
  store.destroy();
});

test('a transport callback failure cannot prevent commit delivery', () => {
  const { store, internal } = createStore({ count: 0 }, {});
  const commits: StoreCommit[] = [];
  onStoreCommit(store, (commit) => {
    commits.push(commit);
  });
  internal.emitPatches = () => {
    throw new Error('transport');
  };
  expect(() => store.setState({ count: 1 })).toThrow('transport');
  expect(commits).toHaveLength(1);
  expect(commits[0].state.count).toBe(1);
  store.destroy();
});

describe.each(Object.entries(writes))('%s commit notifications', (_, write) => {
  test.each(['subscriber', 'commit', 'effect'] as const)(
    '%s errors cannot hide a committed transition',
    (kind) => {
      const store = create({ count: 0 });
      const error = new Error('observer failed');
      const fail = () => {
        if (store.getState().count === 1) throw error;
      };
      const stop =
        kind === 'subscriber'
          ? store.subscribe(fail)
          : kind === 'commit'
            ? onStoreCommit(store, fail)
            : effect(fail);
      const before = store.getPureState();
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => {
        commits.push(commit);
      });
      let notified = 0;
      store.subscribe(() => {
        notified++;
      });
      expect(() => write(store, 1)).toThrow(error);
      expect(commits).toHaveLength(1);
      expect(commits[0].state.count).toBe(1);
      expect(applyPatches(before, commits[0].patches)).toEqual(
        store.getPureState()
      );
      expect(notified).toBe(1);
      stop();
      write(store, 2);
      expect(commits).toHaveLength(2);
      expect(store.getPureState().count).toBe(2);
      store.destroy();
    }
  );

  test.each(['subscriber', 'commit', 'effect'] as const)(
    '%s reentrancy preserves commit order and exact snapshots',
    (kind) => {
      const store = create({ count: 0 });
      const next = () => {
        if (store.getState().count === 1) write(store, 2);
      };
      const stop =
        kind === 'subscriber'
          ? store.subscribe(next)
          : kind === 'commit'
            ? onStoreCommit(store, next)
            : effect(next);
      const before = store.getPureState();
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => {
        commits.push(commit);
      });
      write(store, 1);
      expect(commits.map((commit) => commit.state.count)).toEqual([1, 2]);
      expect(
        commits.reduce(
          (state, commit) => applyPatches(state, commit.patches),
          before
        )
      ).toEqual({ count: 2 });
      expect(
        [...commits]
          .reverse()
          .reduce(
            (state, commit) => applyPatches(state, commit.inversePatches),
            store.getPureState()
          )
      ).toEqual(before);
      stop();
      store.destroy();
    }
  );
});

test('commit readers see invalidated computed values before effects run', () => {
  const store = create(() => ({
    count: 0,
    get double() {
      return this.count * 2;
    }
  }));
  expect(store.getState().double).toBe(0);
  const seen: number[] = [];
  onStoreCommit(store, () => {
    seen.push(store.getState().double);
  });
  store.setState({ count: 1 });
  expect(seen).toEqual([2]);
  store.destroy();
});

test('history records a write even when a subscriber throws', () => {
  const store = create({ count: 0 }, { middlewares: [history()] });
  const stop = store.subscribe(() => {
    throw undefined;
  });
  let threw = false;
  try {
    store.setState({ count: 1 });
  } catch (error) {
    threw = true;
    expect(error).toBeUndefined();
  }
  expect(threw).toBe(true);
  stop();
  const api = (
    store as typeof store & { history: HistoryApi<{ count: number }> }
  ).history;
  expect(api.undo()).toBe(true);
  expect(store.getPureState().count).toBe(0);
  expect(api.redo()).toBe(true);
  expect(store.getPureState().count).toBe(1);
  store.destroy();
});

test('a reentrant history replay retains its suppression scope', () => {
  const store = create({ count: 0 }, { middlewares: [history()] });
  const api = (
    store as typeof store & { history: HistoryApi<{ count: number }> }
  ).history;
  const stop = store.subscribe(() => {
    if (store.getState().count === 1) api.undo();
  });
  store.setState({ count: 1 });
  stop();
  expect(store.getPureState().count).toBe(0);
  expect(api.redo()).toBe(true);
  expect(store.getPureState().count).toBe(1);
  store.destroy();
});

test('sync queues a committed write even when a subscriber throws', async () => {
  const store = create(
    { count: 0 },
    {
      middlewares: [
        sync({
          name: 'notification-outbox',
          storage: false,
          adapter: { pull: async () => ({}), push: async () => ({ ack: [] }) },
          retry: { initialMs: 100000 }
        })
      ]
    }
  );
  const api = getSyncApi(store);
  await api.flush();
  const stop = store.subscribe(() => {
    throw new Error('consumer');
  });
  expect(() => store.setState({ count: 1 })).toThrow('consumer');
  stop();
  expect(api.getPending()).toHaveLength(1);
  expect(applyPatches({ count: 0 }, api.getPending()[0].patches)).toEqual(
    store.getPureState()
  );
  store.destroy();
});
