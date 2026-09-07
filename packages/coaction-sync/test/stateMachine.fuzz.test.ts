import { create } from 'coaction';
import { applyPatches } from 'coaction/adapter';
import { isDeepStrictEqual } from 'node:util';
import { createRandom, firstSeed, runs } from '../../core/test/random';
import {
  getSyncApi,
  sync,
  type SyncAdapter,
  type SyncMutation,
  type SyncPullResult,
  type SyncStorage
} from '../src';

/**
 * Sequential randomized actions, including partial acknowledgements, failures
 * and reopening from storage. Deferred/overlapping responses have separate
 * regression tests; this is not an arbitrary concurrent network scheduler.
 * The server records acknowledged writes independently. Its state plus the
 * pending queue must equal the visible optimistic state after every action.
 */

const settle = async () => {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

type Journal = {
  /** Every mutation id the remote has acknowledged. */
  acked: Set<string>;
  /** Content of every mutation id ever queued. */
  content: Map<string, string>;
  cursors: string[];
  violations: string[];
};

const buildWorld = (seed: number) => {
  const random = createRandom(seed);
  const storage = (() => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (name: string) => map.get(name) ?? null,
      setItem: (name: string, value: string) => {
        map.set(name, value);
      },
      removeItem: (name: string) => {
        map.delete(name);
      }
    } satisfies SyncStorage & { map: Map<string, string> };
  })();

  const journal: Journal = {
    acked: new Set(),
    content: new Map(),
    cursors: [],
    violations: []
  };
  let remote: Record<string, unknown> = { count: 0, label: 'a' };
  let cursorNumber = 0;
  const errors: unknown[] = [];

  const record = (mutations: readonly SyncMutation[]) => {
    for (const mutation of mutations) {
      const content = JSON.stringify(mutation.patches);
      const known = journal.content.get(mutation.id);
      if (known !== undefined && known !== content) {
        journal.violations.push(`mutation ${mutation.id} changed content`);
      } else if (known === undefined) {
        journal.content.set(mutation.id, content);
      }
    }
  };

  const adapter: SyncAdapter = {
    pull: async () => {
      if (random.chance(0.25)) throw new Error('pull failed');
      if (random.chance(0.5)) return {};
      remote = { ...remote, label: `r${(cursorNumber += 1)}` };
      const result: SyncPullResult = {
        patches: [{ op: 'replace', path: ['label'], value: remote.label }],
        cursor: `c${cursorNumber}`
      };
      journal.cursors.push(result.cursor!);
      return result;
    },
    push: async (mutations) => {
      record(mutations);
      if (random.chance(0.3)) throw new Error('push failed');
      // Acknowledge a prefix, so partial acknowledgement is part of the space.
      const taken = mutations.slice(0, random.integer(0, mutations.length));
      for (const mutation of taken) {
        if (!journal.acked.has(mutation.id)) {
          remote = applyPatches(remote, mutation.patches);
          journal.acked.add(mutation.id);
        }
      }
      return { ack: taken.map(({ id }) => id) };
    }
  };

  const open = (name: string) =>
    create<{
      count: number;
      label: string;
      bump: () => void;
      rename: (to: string) => void;
    }>(
      (set) => ({
        count: 0,
        label: 'a',
        bump() {
          set(() => {
            this.count += 1;
          });
        },
        rename(to: string) {
          set(() => {
            this.label = to;
          });
        }
      }),
      {
        middlewares: [
          sync({
            name,
            storage,
            adapter,
            onError: (error) => errors.push(error)
          })
        ]
      }
    );

  return {
    random,
    storage,
    journal,
    adapter,
    open,
    errors,
    record,
    remote: () => remote
  };
};

test('a syncing store preserves pending writes and replay identities across sequential actions', async () => {
  const failures: string[] = [];
  const from = firstSeed();
  for (let seed = from; seed < from + runs(60); seed += 1) {
    const world = buildWorld(seed);
    const { random, journal, open } = world;
    const name = `fuzz-${seed}`;
    let store = open(name);
    let api = getSyncApi(store);
    await settle();

    const schedule: string[] = [];
    const seenCursors: string[] = [];
    let previousPending: string[] = [];
    const note = (why: string) =>
      failures.push(`seed ${seed} [${schedule.join(' ')}]: ${why}`);

    for (let step = 0; step < random.integer(3, 10); step += 1) {
      const action = random.pick([
        'bump',
        'rename',
        'flush',
        'pull',
        'restart'
      ] as const);
      schedule.push(action);
      try {
        if (action === 'bump') store.getState().bump();
        else if (action === 'rename') store.getState().rename(`l${step}`);
        else if (action === 'flush') await api.flush();
        else if (action === 'pull') await api.pull();
        else {
          // A crash and a restart: the process goes away, whatever is durable
          // comes back.
          store.destroy();
          store = open(name);
          api = getSyncApi(store);
        }
      } catch {
        // A failed pull or push is part of the space; the invariants below are
        // what must hold regardless.
      }
      await settle();

      const pending = api.getPending();
      world.record(pending);
      for (const violation of journal.violations.splice(0)) note(violation);
      const pendingIds = new Set(pending.map(({ id }) => id));
      for (const id of previousPending) {
        if (!pendingIds.has(id) && !journal.acked.has(id)) {
          note(`unacknowledged mutation ${id} vanished`);
        }
      }
      previousPending = [...pendingIds];

      // An id is never reused for different content, so an acknowledgement can
      // never be about a write the remote did not see.
      for (const mutation of pending) {
        const known = journal.content.get(mutation.id);
        if (known && known !== JSON.stringify(mutation.patches)) {
          note(`mutation ${mutation.id} changed content while queued`);
        }
      }

      // What the remote has taken does not come back.
      for (const mutation of pending) {
        if (journal.acked.has(mutation.id)) {
          note(`acknowledged mutation ${mutation.id} is queued again`);
        }
      }

      // Ids are unique in the queue -- two mutations sharing one cannot both be
      // acknowledged apart.
      if (new Set(pending.map(({ id }) => id)).size !== pending.length) {
        note('two queued mutations share an id');
      }

      // Check each pair at its actual base, then the complete optimistic state.
      let replayed = world.remote();
      for (const mutation of pending) {
        try {
          const state = applyPatches(replayed, mutation.patches);
          const restored = applyPatches(state, mutation.inversePatches);
          if (!isDeepStrictEqual(restored, replayed)) {
            note(`mutation ${mutation.id} inverse does not restore its base`);
          }
          replayed = state;
        } catch {
          note(`mutation ${mutation.id} carries an unusable pair`);
        }
      }
      if (!isDeepStrictEqual(replayed, store.getPureState())) {
        note(
          'server state plus pending mutations differs from optimistic state'
        );
      }

      // Cursors move forwards. Every one the remote issued is in order, and the
      // store never reports one it was not given.
      const checkpoint = world.storage.map.get(name);
      if (checkpoint) {
        const parsed = JSON.parse(checkpoint) as { cursor?: string };
        if (parsed.cursor) {
          const index = journal.cursors.indexOf(parsed.cursor);
          if (index === -1) note(`unknown cursor ${parsed.cursor}`);
          else {
            const last = seenCursors[seenCursors.length - 1];
            if (last && journal.cursors.indexOf(last) > index) {
              note(`cursor went backwards: ${last} -> ${parsed.cursor}`);
            }
            if (last !== parsed.cursor) seenCursors.push(parsed.cursor);
          }
        }
      }

      // The status is one of the ones it declares.
      if (
        !['hydrating', 'idle', 'syncing', 'offline', 'error'].includes(
          api.getStatus()
        )
      ) {
        note(`unknown status ${api.getStatus()}`);
      }

      if (failures.length > 3) break;
    }
    store.destroy();
    if (failures.length > 3) break;
  }
  expect(failures).toEqual([]);
}, 600000);
