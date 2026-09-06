import { apply as applyPatches } from 'mutative';
import { describe, expect, test } from 'vitest';
import { onStoreCommit, type StoreCommit } from '../adapter';
import type { Store } from '../src';

/**
 * The one invariant everything built on patches rests on:
 *
 *     initial state + every commit's patches === the state the store holds
 *
 * Asserting on the state cannot see it break. On a mutable instance the
 * instance *is* the state, so a write that never made it into a commit still
 * reads back correctly from `getState()`, renders correctly, and notifies
 * subscribers -- while `@coaction/history` has nothing to undo, `@coaction/sync`
 * has nothing to send, and a replay rebuilds a different store. Every hole
 * found in the transaction model so far has looked exactly like that.
 *
 * Adapters run this over the shapes that put more than one action in flight at
 * once, which is where the single draft slot has to change hands.
 */

export type CommitReplayCounter = {
  n: number;
  /** `n += 1` */
  step: () => void;
  /** `n += 10`, then `step()`, then `n += 10` */
  nested: () => void;
  /** `n += 100`, await the gate, `n += 100` */
  suspend: () => Promise<void>;
  /** `n += 1000`, await the gate, then `step()`, then `n += 1000` */
  suspendThenNested: () => Promise<void>;
};

export type CommitReplayContract = {
  packageName: string;
  /**
   * Build a store whose actions follow {@link CommitReplayCounter}. `release`
   * settles whatever `suspend` and `suspendThenNested` are waiting on.
   */
  createStore: () => {
    store: Store<CommitReplayCounter>;
    /** Settle every gate outstanding, including several at once. */
    release: () => void;
    cleanup?: () => void;
  };
};

const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

export const runCommitReplayInvariant = ({
  packageName,
  createStore
}: CommitReplayContract) => {
  const check = async (
    label: string,
    run: (
      state: CommitReplayCounter,
      release: () => void
    ) => Promise<unknown> | unknown,
    expected: number
  ) => {
    test(`${label} replays to the state it produced`, async () => {
      const { store, release, cleanup } = createStore();
      const initial = JSON.parse(JSON.stringify(store.getPureState()));
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => commits.push(commit));

      await run(store.getState(), release);
      await settle();

      expect(store.getState().n).toBe(expected);
      expect(
        commits.reduce(
          (state, commit) => applyPatches(state, commit.patches),
          initial as object
        )
      ).toEqual(store.getPureState());
      store.destroy();
      cleanup?.();
    });
  };

  describe(`${packageName} commit replay invariant`, () => {
    check('a single action', (state) => state.step(), 1);
    check('a nested action', (state) => state.nested(), 21);
    check(
      'an async action on its own',
      async (state, release) => {
        const pending = state.suspend();
        await settle();
        release();
        await pending;
      },
      200
    );
    check(
      'an async action interrupted by one that finishes',
      async (state, release) => {
        const pending = state.suspend();
        await settle();
        state.step();
        release();
        await pending;
      },
      201
    );
    check(
      'an async action interrupted by a nested pair',
      async (state, release) => {
        const pending = state.suspend();
        await settle();
        state.nested();
        release();
        await pending;
      },
      221
    );
    check(
      'two async actions overlapping',
      async (state, release) => {
        const first = state.suspend();
        await settle();
        const second = state.suspendThenNested();
        await settle();
        release();
        await Promise.all([first, second]);
      },
      2201
    );
    check(
      'an async action that nests after its await',
      async (state, release) => {
        const pending = state.suspendThenNested();
        await settle();
        release();
        await pending;
      },
      2001
    );
  });
};
