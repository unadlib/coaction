import { makeAutoObservable } from 'mobx';
import { isDraft } from 'mutative';
import { create, type Store } from 'coaction';
import {
  onStoreCommit,
  onStoreCommitValidate,
  type StoreCommit
} from 'coaction/adapter';
import { apply as applyPatches } from 'mutative';
import {
  createRandom,
  firstSeed,
  forEachSeed,
  runs,
  type Random
} from '../../core/test/random';
import { bindMobx } from '../src';

/**
 * Random schedules against the invariant, rather than the schedules I thought
 * of.
 *
 *     initial state + every commit's patches === the state the store holds
 *
 * There is no model here. The oracle is the store itself, which is the point:
 * every model of a transaction system I could write would come from the same
 * mental picture as the implementation and agree with it for the same wrong
 * reasons. What a random schedule can do that a written test cannot is find the
 * ordering nobody thought to write down -- and each of the last few bugs in the
 * draft ownership model was exactly one of those, found by someone reading
 * control flow because nothing was generating them.
 */

type Action = {
  /** Reads as an action body, so a failing schedule is legible. */
  name: string;
  run: () => Promise<void> | void;
};

const buildStore = (random: Random) => {
  // One gate per suspended action, released individually and in any order.
  // Releasing them all at once ties completion order to start order, and the
  // orderings that break ownership are the ones where they differ -- three in
  // flight, the middle one finishing first, the first one finishing last.
  const waiting: Array<() => void> = [];
  const gate = () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  const releaseOne = (index: number) => {
    const [resolve] = waiting.splice(index, 1);
    resolve?.();
  };
  const store = create<any>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          when: 'iso',
          items: [] as number[],
          rows: [[1, 2, 3], [4, 5], [6]] as unknown[],
          step() {
            this.n += 1;
          },
          /**
           * Writes inside a nested array and then shifts the array holding it,
           * which is the shape whose inverse pair is order-sensitive. Without
           * an action like this the undo walk never exercises it.
           */
          shuffle() {
            const first = this.rows[0];
            if (Array.isArray(first) && first.length >= 3) first.reverse();
            // A scalar: unshifting a draftable value makes mutative emit
            // whole-element replaces rather than a patch per index, and the
            // per-index form is what makes the inverse order-sensitive.
            this.rows.unshift(this.n);
          },
          drop() {
            if (this.rows.length > 1) this.rows.shift();
          },
          push() {
            this.items.push(this.n);
          },
          trim() {
            this.items.length = Math.max(0, this.items.length - 1);
          },
          nested() {
            this.n += 10;
            this.step();
            this.push();
          },
          async suspend() {
            this.n += 100;
            await gate();
            this.n += 100;
          },
          async suspendThenNested() {
            this.push();
            await gate();
            this.nested();
          },
          /** Writes a value a commit validator refuses, then suspends. */
          async suspendThenRefused() {
            this.n += 1;
            (this as { when: unknown }).when = new Date(0);
            await gate();
            this.n += 1;
          },
          async suspendThenThrow() {
            this.n += 1000;
            await gate();
            throw new Error('rejected');
          }
        })
      ),
    { name: `fuzz-${random.integer(0, 1e9)}`, enablePatches: true }
  );
  return {
    store,
    pending: () => waiting.length,
    releaseOne,
    release: () => waiting.splice(0).forEach((go) => go())
  };
};

const SYNC = ['step', 'push', 'trim', 'nested', 'shuffle', 'drop'] as const;
const ASYNC = [
  'suspend',
  'suspendThenNested',
  'suspendThenThrow',
  'suspendThenRefused'
] as const;

// Each independent schedule gets its own test timeout. Putting the entire
// corpus in one async test makes slower CI workers time out on valid schedules.
// Keep the same seed ranges, including the scale and offset used by soak runs.
const seeds = (count: number) =>
  Array.from({ length: runs(count) }, (_, index) => firstSeed() + index);

test.each(seeds(250))(
  'any interleaving of actions replays to the state it produced (seed %i)',
  async (seed) => {
    const failures: string[] = [];
    const random = createRandom(seed);
    const { store, release, releaseOne, pending } = buildStore(random);
    try {
      const initial = JSON.parse(JSON.stringify(store.getPureState()));
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => commits.push(commit));
      // A refusal is another way for a transaction to end, and the one that
      // used to leave ownership pointing at a finalised draft.
      onStoreCommitValidate(store as Store<any>, (commit) => {
        for (const patch of commit.patches) {
          if ('value' in patch && patch.value instanceof Date) {
            throw new TypeError('no Dates');
          }
        }
      });

      const schedule: string[] = [];
      const inFlight: Array<Promise<unknown>> = [];
      const steps = random.integer(3, 12);
      for (let step = 0; step < steps; step += 1) {
        // Weighted so several actions pile up before any of them is released.
        // With a flat probability the queue rarely got past two, and the
        // orderings that break ownership need three -- the middle one finishing
        // first and the first one finishing last.
        if (pending() >= 2 && random.chance(pending() >= 4 ? 0.7 : 0.18)) {
          // One of them, chosen at random, so completion order comes apart from
          // start order.
          const index = random.integer(0, pending() - 1);
          schedule.push(`release#${index}`);
          releaseOne(index);
          for (let drain = 0; drain < 4; drain += 1) await Promise.resolve();
          continue;
        }
        if (random.chance(pending() >= 4 ? 0.3 : 0.65)) {
          const name = random.pick(ASYNC);
          schedule.push(name);
          const pending = store.getState()[name]();
          inFlight.push(pending.catch(() => undefined));
        } else {
          const name = random.pick(SYNC);
          schedule.push(name);
          store.getState()[name]();
        }
        if (random.chance(0.4)) await Promise.resolve();
      }
      release();
      await Promise.allSettled(inFlight);
      for (let drain = 0; drain < 8; drain += 1) await Promise.resolve();

      const replayed = commits.reduce(
        (state, commit) => applyPatches(state, commit.patches),
        initial as object
      );
      const held = store.getPureState();
      if (JSON.stringify(replayed) !== JSON.stringify(held)) {
        failures.push(
          `seed ${seed} [${schedule.join(' ')}]: replay ${JSON.stringify(replayed)} but store holds ${JSON.stringify(held)}`
        );
      }
      if (isDraft(held)) {
        failures.push(
          `seed ${seed} [${schedule.join(' ')}]: left a draft open`
        );
      }
      expect(failures).toEqual([]);
    } finally {
      release();
      store.destroy();
    }
  }
);

test.each(seeds(150))(
  'any interleaving leaves an inverse that undoes every commit (seed %i)',
  async (seed) => {
    const failures: string[] = [];
    const random = createRandom(seed);
    const { store, release } = buildStore(random);
    try {
      const initial = JSON.parse(JSON.stringify(store.getPureState()));
      const commits: StoreCommit[] = [];
      onStoreCommit(store, (commit) => commits.push(commit));

      const inFlight: Array<Promise<unknown>> = [];
      const schedule: string[] = [];
      for (let step = 0; step < random.integer(2, 7); step += 1) {
        const name = random.chance(0.5)
          ? random.pick(ASYNC)
          : random.pick(SYNC);
        schedule.push(name);
        const result = store.getState()[name]();
        if (result instanceof Promise)
          inFlight.push(result.catch(() => undefined));
        if (random.chance(0.5)) await Promise.resolve();
      }
      release();
      await Promise.allSettled(inFlight);
      for (let drain = 0; drain < 8; drain += 1) await Promise.resolve();

      // Walk the commits backwards, applying each inverse. This is what
      // `@coaction/history` undo does and what a sync rebase rolls back with, and
      // it is where a pair that cannot be applied shows up.
      let undone: object = JSON.parse(JSON.stringify(store.getPureState()));
      try {
        for (let index = commits.length - 1; index >= 0; index -= 1) {
          undone = applyPatches(undone, commits[index].inversePatches);
        }
      } catch (error) {
        failures.push(
          `seed ${seed} [${schedule.join(' ')}]: ${(error as Error).message}`
        );
      }
      if (JSON.stringify(undone) !== JSON.stringify(initial)) {
        failures.push(
          `seed ${seed} [${schedule.join(' ')}]: undo reached ${JSON.stringify(undone)} not ${JSON.stringify(initial)}`
        );
      }
      expect(failures).toEqual([]);
    } finally {
      release();
      store.destroy();
    }
  }
);

test('a seed that has failed before', () => {
  // Seeds land here by name when a fuzz run finds one, so the schedule that
  // broke is a fixed case rather than something that depends on the generator
  // staying the way it is today.
  forEachSeed(1, (random) => {
    const { store } = buildStore(random);
    expect(store.getState().n).toBe(0);
    store.destroy();
  });
});
