import { create } from 'coaction';
import { applyPatches } from 'coaction/adapter';
import { createRandom, firstSeed, runs } from '../../core/test/random';
import { getSyncApi, sync, type Patches, type SyncOptions } from '../src';

const row = (id: string) => ({ id, title: id });
const setup = async <T extends object>(
  base: T,
  conflict: SyncOptions['conflict'] = 'local-wins'
) => {
  let patches: Patches = [];
  const errors: unknown[] = [];
  const store = create(base, {
    middlewares: [
      sync({
        name: 'array-coordinates',
        storage: false,
        conflict,
        adapter: {
          pull: async () => ({ patches }),
          push: async () => ({ ack: [] })
        },
        onError: (error) => errors.push(error)
      })
    ]
  });
  const api = getSyncApi(store);
  await api.flush();
  return {
    store,
    api,
    errors,
    write: (patches: Patches) => store.apply(store.getPureState(), patches),
    pull: async (next: Patches) => {
      patches = next;
      await api.pull();
    },
    assertReplay: (remote: T) => {
      const pending = api.getPending();
      let state = remote;
      for (const mutation of pending) {
        const before = state;
        state = applyPatches(state, mutation.patches);
        expect(applyPatches(state, mutation.inversePatches)).toEqual(before);
      }
      expect(state).toEqual(store.getPureState());
    }
  };
};

describe.each(['local-wins', 'remote-wins', 'resolver'] as const)(
  '%s',
  (policy) => {
    test.each([
      'insert-edit',
      'remove-edit',
      'insert-only',
      'nested',
      'length'
    ])('compares %s in the same array coordinates', async (scenario) => {
      const calls: Patches[] = [];
      const initial = { groups: [{ rows: [row('A'), row('B')] }] };
      const world = await setup(
        initial,
        policy === 'resolver'
          ? ({ overlappingRemotePatches }) => {
              calls.push(overlappingRemotePatches);
              return 'remote';
            }
          : policy
      );
      try {
        world.write([
          {
            op: 'replace',
            path: ['groups', 0, 'rows', 1, 'title'],
            value: 'local'
          }
        ]);
        const prefix = ['groups', 0, 'rows'];
        const patches: Patches =
          scenario === 'nested'
            ? [
                { op: 'add', path: ['groups', 0], value: { rows: [] } },
                { op: 'add', path: ['groups', 1, 'rows', 0], value: row('X') },
                {
                  op: 'replace',
                  path: '/groups/1/rows/2/title',
                  value: 'remote'
                }
              ]
            : scenario === 'length'
              ? [{ op: 'replace', path: [...prefix, 'length'], value: 1 }]
              : scenario === 'insert-only'
                ? [{ op: 'add', path: [...prefix, 1], value: row('X') }]
                : [
                    scenario === 'insert-edit'
                      ? { op: 'add', path: [...prefix, 0], value: row('X') }
                      : { op: 'remove', path: [...prefix, 0] },
                    {
                      op: 'replace',
                      path: [
                        ...prefix,
                        scenario === 'insert-edit' ? 2 : 0,
                        'title'
                      ],
                      value: 'remote'
                    }
                  ];
        await world.pull(patches);
        const remote = applyPatches(initial, patches);
        const rows = world.store
          .getPureState()
          .groups.flatMap(({ rows }) => rows);
        const expected =
          scenario === 'length'
            ? undefined
            : scenario === 'insert-only' || policy === 'local-wins'
              ? 'local'
              : 'remote';
        expect(rows.find(({ id }) => id === 'B')?.title).toBe(expected);
        expect(calls).toHaveLength(
          policy === 'resolver' && scenario !== 'insert-only' ? 1 : 0
        );
        if (scenario === 'nested' && policy === 'resolver')
          expect(calls[0]).toEqual([patches[2]]);
        world.assertReplay(remote);
      } finally {
        world.store.destroy();
      }
    });
  }
);

test('later local mutations retain coordinates established by earlier local insertions', async () => {
  const initial = { rows: [row('A'), row('B')] };
  const world = await setup(initial, 'remote-wins');
  try {
    world.write([{ op: 'add', path: ['rows', 1], value: row('L') }]);
    world.write([
      { op: 'replace', path: ['rows', 2, 'title'], value: 'local-B' }
    ]);
    world.write([
      { op: 'replace', path: ['rows', 1, 'title'], value: 'local-L' }
    ]);
    const remote: Patches = [
      { op: 'add', path: ['rows', 0], value: row('X') },
      { op: 'replace', path: ['rows', 2, 'title'], value: 'remote-B' }
    ];
    await world.pull(remote);
    expect(world.store.getPureState().rows).toEqual([
      row('X'),
      row('A'),
      { id: 'L', title: 'local-L' },
      { id: 'B', title: 'remote-B' }
    ]);
    expect(world.api.getPending()).toHaveLength(2);
    world.assertReplay(applyPatches(initial, remote));
  } finally {
    world.store.destroy();
  }
});

test('local truncation preserves remote insertions and refreshed inverse pairs across another pull', async () => {
  const initial = { rows: [row('A'), row('B'), row('C')] };
  const world = await setup(initial);
  try {
    world.write([{ op: 'replace', path: ['rows', 'length'], value: 1 }]);
    const first: Patches = [{ op: 'add', path: ['rows', 1], value: row('X') }];
    await world.pull(first);
    expect(world.store.getPureState().rows).toEqual([row('A'), row('X')]);
    const second: Patches = [{ op: 'remove', path: ['rows', 0] }];
    await world.pull(second);
    expect(world.store.getPureState().rows).toEqual([row('X')]);
    world.assertReplay(applyPatches(applyPatches(initial, first), second));
  } finally {
    world.store.destroy();
  }
});

test('dropping an unapplicable multi-patch mutation leaves later coordinates intact', async () => {
  const initial = { rows: [row('A'), row('B'), row('C')] };
  const world = await setup(initial);
  try {
    world.write([
      { op: 'add', path: ['rows', 0], value: row('L') },
      { op: 'replace', path: ['rows', 2, 'title'], value: 'local-B' }
    ]);
    world.write([
      { op: 'replace', path: ['rows', 3, 'title'], value: 'local-C' }
    ]);
    const patches: Patches = [{ op: 'remove', path: ['rows', 1] }];
    await world.pull(patches);
    expect(world.store.getPureState().rows).toEqual([
      row('A'),
      { id: 'C', title: 'local-C' }
    ]);
    expect(world.errors).toHaveLength(1);
    expect(world.api.getPending()).toHaveLength(1);
    world.assertReplay(applyPatches(initial, patches));
  } finally {
    world.store.destroy();
  }
});

test('random structural remote schedules preserve the intended local array entry', async () => {
  for (
    let seed = firstSeed() + 7200;
    seed < firstSeed() + 7200 + runs(40);
    seed++
  ) {
    const random = createRandom(seed);
    const initial = {
      rows: Array.from({ length: 6 }, (_, i) => row(String(i)))
    };
    const target = random.integer(0, 5);
    const policy = random.integer(0, 1) ? 'remote-wins' : 'local-wins';
    const world = await setup(initial, policy);
    try {
      world.write([
        { op: 'replace', path: ['rows', target, 'title'], value: 'local' }
      ]);
      const expected = structuredClone(initial);
      const remote: Patches = [];
      let edited = false;
      for (let step = 0; step < 8; step++) {
        const index = random.integer(0, expected.rows.length);
        if (index === expected.rows.length || random.integer(0, 1)) {
          const value = row(`new-${step}`);
          remote.push({
            op: 'add',
            path: ['rows', index],
            value: structuredClone(value)
          });
          expected.rows.splice(index, 0, value);
        } else if (random.chance(0.5)) {
          remote.push({ op: 'remove', path: ['rows', index] });
          expected.rows.splice(index, 1);
        } else {
          if (expected.rows[index].id === String(target)) edited = true;
          remote.push({
            op: 'replace',
            path: ['rows', index, 'title'],
            value: 'remote'
          });
          expected.rows[index].title = 'remote';
        }
      }
      const remoteState = structuredClone(expected);
      const survivor = expected.rows.find(({ id }) => id === String(target));
      if (survivor && (policy === 'local-wins' || !edited))
        survivor.title = 'local';
      await world.pull(remote);
      expect({ seed, state: world.store.getPureState() }).toEqual({
        seed,
        state: expected
      });
      world.assertReplay(remoteState);
    } finally {
      world.store.destroy();
    }
  }
});
