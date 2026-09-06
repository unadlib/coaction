import { createRandom, forEachSeed, type Random } from '../../core/test/random';
import {
  CHECKPOINT_FORMAT_VERSION,
  isMutationShape,
  parseJournal,
  readCheckpointBody,
  readOutbox
} from '../src/checkpoint';
import type { SyncMutation } from '../src/types';

/**
 * The checkpoint parser is the only place where data somebody else wrote --
 * an older build, a half-finished write, another tab using the same key --
 * becomes state this store will act on. It is also a pure function over a
 * string, which makes it the one part of the sync layer where a property can
 * be checked against something better than a second opinion of mine: a
 * round trip, and totality.
 *
 * `scripts/check-checkpoint-properties.mjs` mutates the parser and asserts
 * these properties catch each mutation, so a green run here means something.
 */

const WHAT = 'The checkpoint';

/** A refusal the parser decided on, as opposed to something it tripped over. */
const rejection = (error: unknown) =>
  error instanceof TypeError && error.message.startsWith(WHAT);

const patch = (random: Random) => {
  const op = random.pick(['add', 'replace', 'remove'] as const);
  const path = random.chance(0.15)
    ? random.list(0, 3, () => random.word()).join('/')
    : random.list(0, 3, () =>
        random.chance(0.3) ? random.integer(0, 5) : random.word()
      );
  return op === 'remove'
    ? { op, path }
    : {
        op,
        path,
        value: random.pick([
          1,
          'text',
          true,
          null,
          { nested: 1 },
          [1, 2],
          ''
        ] as unknown[])
      };
};

const mutation = (random: Random, index: number): SyncMutation =>
  ({
    id: `m${index}-${random.integer(0, 1e6)}`,
    createdAt: random.integer(0, 2 ** 40),
    patches: random.list(0, 4, () => patch(random)),
    inversePatches: random.list(0, 4, () => patch(random))
  }) as SyncMutation;

const checkpoint = (random: Random) => {
  const body: Record<string, unknown> = {
    outbox: random.list(0, 6, (index) => mutation(random, index))
  };
  if (random.chance(0.7)) body.formatVersion = CHECKPOINT_FORMAT_VERSION;
  if (random.chance(0.5)) body.cursor = random.word();
  if (random.chance(0.5)) body.revision = random.word();
  if (random.chance(0.5))
    body.state = { [random.word()]: random.integer(0, 9) };
  if (random.chance(0.3))
    body.adapter = { seen: random.list(0, 3, () => random.word()) };
  return body;
};

test('a checkpoint this build wrote reads back as what was written', () => {
  forEachSeed(400, (random) => {
    const written = checkpoint(random);
    const body = readCheckpointBody(JSON.stringify(written), WHAT);
    expect(readOutbox(body.outbox, WHAT)).toEqual(written.outbox);
    for (const key of [
      'formatVersion',
      'cursor',
      'revision',
      'state',
      'adapter'
    ]) {
      expect(body[key]).toEqual(written[key]);
    }
  });
});

/**
 * Anything at all under that key, in one call. The parser has exactly two
 * permitted outcomes, and "returned something the rest of the middleware then
 * treats as a checkpoint" is not one of them for junk input.
 */
const arbitrary = (random: Random): unknown => {
  const depth = random.integer(0, 2);
  const leaf = () =>
    random.pick([
      0,
      -1,
      1.5,
      NaN,
      'x',
      '',
      true,
      false,
      null,
      undefined
    ] as unknown[]);
  const build = (level: number): unknown => {
    if (level >= depth) return leaf();
    if (random.chance(0.5)) return random.list(0, 3, () => build(level + 1));
    // Half the keys are the ones the parser actually reads. Random words never
    // landed on `outbox`, so the totality property was exercising the first two
    // lines of the parser and nothing else.
    const key = () =>
      random.chance(0.5)
        ? random.pick([
            '__proto__',
            'constructor',
            'prototype',
            'outbox',
            'formatVersion',
            'cursor',
            'revision',
            'state',
            'adapter',
            'id',
            'createdAt',
            'patches',
            'inversePatches',
            'op',
            'path',
            'value'
          ])
        : random.word();
    return Object.fromEntries(
      random.list(0, 4, () => [key(), build(level + 1)])
    );
  };
  return build(0);
};

test('any input either parses into a well-formed checkpoint or is refused', () => {
  forEachSeed(600, (random) => {
    const raw = random.chance(0.1)
      ? random.pick(['', '{', 'null', '[]', '[1,2]', '{"outbox":', 'undefined'])
      : JSON.stringify(arbitrary(random));
    let body: Record<string, unknown> | undefined;
    let outbox: SyncMutation[] | undefined;
    try {
      body = readCheckpointBody(raw ?? 'null', WHAT);
      outbox = readOutbox(body.outbox, WHAT);
    } catch (error) {
      // The one permitted failure, and it has to be a decision rather than a
      // crash. `instanceof TypeError` alone accepted `value.findIndex is not a
      // function` -- which is what removing the array check produces, so the
      // mutation testing found the parser could stop checking and this would
      // still pass. Every deliberate rejection names the checkpoint.
      expect(rejection(error)).toBe(true);
      return;
    }
    // The other: a body that is an object, and an outbox of real mutations
    // with ids that can actually be acknowledged apart.
    expect(typeof body).toBe('object');
    expect(Array.isArray(body)).toBe(false);
    expect(Array.isArray(outbox)).toBe(true);
    expect(outbox!.every(isMutationShape)).toBe(true);
    expect(new Set(outbox!.map(({ id }) => id)).size).toBe(outbox!.length);
    const version = body!.formatVersion;
    expect(
      version === undefined ||
        (Number.isInteger(version) &&
          (version as number) >= 1 &&
          (version as number) <= CHECKPOINT_FORMAT_VERSION)
    ).toBe(true);
  });
});

test('breaking one field of a written checkpoint is always noticed', () => {
  forEachSeed(300, (random) => {
    const written = checkpoint(random) as Record<string, unknown>;
    written.outbox = random.list(1, 4, (index) => mutation(random, index));
    const damage = random.pick([
      (body: Record<string, unknown>) => {
        body.formatVersion = CHECKPOINT_FORMAT_VERSION + random.integer(1, 9);
      },
      (body: Record<string, unknown>) => {
        body.formatVersion = random.pick([0, -1, 1.5, 'one', null]);
      },
      (body: Record<string, unknown>) => {
        body.outbox = random.pick([{}, 'list', 3, true]);
      },
      (body: Record<string, unknown>) => {
        const outbox = body.outbox as SyncMutation[];
        const target = random.integer(0, outbox.length - 1);
        const field = random.pick([
          'id',
          'createdAt',
          'patches',
          'inversePatches'
        ] as const);
        // Per field, because what is invalid depends on the field. The first
        // version of this put `3` in `createdAt` and called it damage; three
        // milliseconds after the epoch is an odd timestamp and a valid one, so
        // the parser accepted it and the property was right to complain.
        outbox[target] = {
          ...outbox[target],
          [field]: random.pick(
            field === 'createdAt'
              ? ([undefined, null, '', 'x', {}] as unknown[])
              : ([undefined, null, '', 3, {}] as unknown[])
          )
        } as SyncMutation;
      },
      (body: Record<string, unknown>) => {
        const outbox = body.outbox as SyncMutation[];
        outbox.push({ ...outbox[0] });
      },
      (body: Record<string, unknown>) => {
        const outbox = body.outbox as SyncMutation[];
        const target = outbox[random.integer(0, outbox.length - 1)];
        // Wrong in exactly one way and otherwise complete. The first version
        // of these all lacked `value`, so every one of them was rejected by
        // that check and the op and path checks were never reached -- removing
        // either from the parser left this suite green.
        (target.patches as unknown[]).push(
          random.pick([
            { op: 'nope', path: [], value: 1 },
            { op: 'add', path: 3, value: 1 },
            { op: 'add', path: [{ deep: true }], value: 1 },
            { op: 'add', path: [] },
            { op: 'replace', path: [] },
            // Paths that reach outside the state. mutative refuses these on
            // its own, so a checkpoint carrying one was never dangerous -- but
            // it was accepted here and rejected much later, by something else.
            { op: 'replace', path: ['__proto__', 'polluted'], value: 1 },
            { op: 'replace', path: ['doc', 'constructor', 'x'], value: 1 },
            { op: 'replace', path: 'prototype/x', value: 1 },
            'patch',
            null,
            3
          ])
        );
      }
    ]);
    damage(written);
    const raw = JSON.stringify(written);
    let refused = false;
    try {
      readOutbox(readCheckpointBody(raw, WHAT).outbox, WHAT);
    } catch (error) {
      refused = rejection(error);
    }
    // A property that fails has to say what it fed in, or the seed is the only
    // clue and reproducing it means rebuilding the generator by hand.
    if (!refused) {
      throw new Error(`damage was accepted: ${raw}`);
    }
  });
});

test('the journal reads both of its historical shapes and refuses the rest', () => {
  forEachSeed(200, (random) => {
    const outbox = random.list(0, 4, (index) => mutation(random, index));
    expect(parseJournal(JSON.stringify(outbox), WHAT)).toEqual(outbox);
    expect(
      parseJournal(
        JSON.stringify({ formatVersion: CHECKPOINT_FORMAT_VERSION, outbox }),
        WHAT
      )
    ).toEqual(outbox);
    expect(parseJournal(null, WHAT)).toEqual([]);
    expect(parseJournal('', WHAT)).toEqual([]);
  });
});

// A seed that failed once belongs here, named, so it never comes back.
test('seeds that have failed before', () => {
  for (const seed of [1, 7, 42]) {
    const random = createRandom(seed);
    const written = checkpoint(random);
    expect(
      readOutbox(readCheckpointBody(JSON.stringify(written), WHAT).outbox, WHAT)
    ).toEqual(written.outbox);
  }
});
