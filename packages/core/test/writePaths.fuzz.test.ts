import { apply as applyPatches } from 'mutative';
import { create } from '../src';
import {
  onStoreCommit,
  replayStorePatches,
  type StoreCommit
} from '../adapter';
import { createRandom, type Random } from './random';

/**
 * The same two invariants as the adapter fuzz, over a native store and every
 * public way of writing to one.
 *
 *     initial + every commit's patches   === the state the store holds
 *     the state, undone commit by commit === the state it started in
 *
 * A native store reaches shapes a mutable instance does not. Writing inside a
 * nested array and then shifting the array is one: through a MobX adapter the
 * element comes out as a whole-value replace, while here it is a patch per
 * index, and the pair for that is the one whose ordering had to be fixed. So
 * both fuzzes are needed and neither subsumes the other.
 */

type Fuzzed = {
  n: number;
  rows: unknown[];
  label: string;
  bump: () => void;
  shuffle: () => void;
  truncate: () => void;
  nest: () => void;
};

const buildStore = () =>
  create<Fuzzed>((set) => ({
    n: 0,
    rows: [[1, 2, 3], [4, 5], [6]],
    label: 'a',
    bump() {
      set(() => {
        this.n += 1;
      });
    },
    shuffle() {
      set(() => {
        const first = this.rows[0];
        if (Array.isArray(first) && first.length >= 3) first.reverse();
        // A scalar, deliberately. Unshifting a draftable value makes mutative
        // emit whole-element replaces instead of a patch per index, and the
        // per-index form is the whole point of this action -- one token's
        // difference in the generator decided whether an entire class of
        // inverse-ordering bug was reachable at all.
        this.rows.unshift(this.n);
      });
    },
    truncate() {
      set(() => {
        this.rows.length = Math.max(0, this.rows.length - 1);
      });
    },
    nest() {
      set(() => {
        const first = this.rows[0];
        if (Array.isArray(first) && first.length) {
          first[first.length - 1] = this.n;
        }
        this.rows.push([this.n]);
      });
    }
  }));

const write = (random: Random, store: ReturnType<typeof buildStore>) => {
  const choice = random.pick([
    'bump',
    'shuffle',
    'truncate',
    'nest',
    'setState-object',
    'apply-replacement',
    'apply-patches',
    'replay'
  ] as const);
  switch (choice) {
    case 'setState-object':
      store.setState({ ...store.getPureState(), label: random.word() });
      return choice;
    case 'apply-replacement':
      store.apply({ ...store.getPureState(), n: random.integer(0, 99) });
      return choice;
    case 'apply-patches':
      store.apply(store.getPureState(), [
        { op: 'replace', path: ['label'], value: random.word() }
      ]);
      return choice;
    case 'replay':
      replayStorePatches(store, {
        patches: [{ op: 'replace', path: ['n'], value: random.integer(0, 99) }],
        inversePatches: [
          { op: 'replace', path: ['n'], value: store.getState().n }
        ]
      });
      return choice;
    default:
      store.getState()[choice]();
      return choice;
  }
};

const clone = (value: unknown) => JSON.parse(JSON.stringify(value));

test('every write path replays to the state it produced', () => {
  const failures: string[] = [];
  for (let seed = 1; seed <= 300; seed += 1) {
    const random = createRandom(seed);
    const store = buildStore();
    const initial = clone(store.getPureState());
    const commits: StoreCommit<Fuzzed>[] = [];
    onStoreCommit(store, (commit) => commits.push(commit));

    const schedule: string[] = [];
    for (let step = 0; step < random.integer(1, 8); step += 1) {
      schedule.push(write(random, store));
    }

    const replayed = commits.reduce(
      (state, commit) => applyPatches(state, commit.patches),
      initial as object
    );
    if (JSON.stringify(replayed) !== JSON.stringify(store.getPureState())) {
      failures.push(
        `seed ${seed} [${schedule.join(' ')}]: replay ${JSON.stringify(replayed)} but store holds ${JSON.stringify(store.getPureState())}`
      );
    }
    store.destroy();
  }
  expect(failures).toEqual([]);
});

test('every commit can be undone by the inverse it carries', () => {
  const failures: string[] = [];
  for (let seed = 1; seed <= 300; seed += 1) {
    const random = createRandom(seed);
    const store = buildStore();
    const initial = clone(store.getPureState());
    const commits: StoreCommit<Fuzzed>[] = [];
    onStoreCommit(store, (commit) => commits.push(commit));

    const schedule: string[] = [];
    for (let step = 0; step < random.integer(1, 8); step += 1) {
      schedule.push(write(random, store));
    }

    // What undo does, and what a sync rebase rolls back with.
    let undone: object = clone(store.getPureState());
    try {
      for (let index = commits.length - 1; index >= 0; index -= 1) {
        undone = applyPatches(undone, commits[index].inversePatches);
      }
    } catch (error) {
      failures.push(
        `seed ${seed} [${schedule.join(' ')}]: ${(error as Error).message}`
      );
      store.destroy();
      continue;
    }
    if (JSON.stringify(undone) !== JSON.stringify(initial)) {
      failures.push(
        `seed ${seed} [${schedule.join(' ')}]: undo reached ${JSON.stringify(undone)} not ${JSON.stringify(initial)}`
      );
    }
    store.destroy();
  }
  expect(failures).toEqual([]);
});
