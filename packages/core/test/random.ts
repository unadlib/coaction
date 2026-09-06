/**
 * A seeded generator, so a failure is a number you can paste back.
 *
 * Property tests are only useful if a red run tells you how to reproduce it.
 * `Math.random()` gives a failure you cannot get back; every generator here
 * takes an explicit seed, and a failing seed goes straight into the suite as a
 * fixed case.
 *
 * mulberry32: small, fast, and adequate for shaping test inputs. It is not a
 * cryptographic source and nothing here should treat it as one.
 */
export const createRandom = (seed: number) => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  const pick = <T>(values: readonly T[]): T =>
    values[integer(0, values.length - 1)];
  return {
    next,
    integer,
    pick,
    /** True with the given probability. */
    chance: (probability: number) => next() < probability,
    /** Between `min` and `max` values from `make`. */
    list: <T>(min: number, max: number, make: (index: number) => T): T[] =>
      Array.from({ length: integer(min, max) }, (_, index) => make(index)),
    /** A short identifier-ish string, occasionally an awkward one. */
    word: () =>
      pick([
        'a',
        'b',
        'count',
        'label',
        'items',
        'user',
        'nested',
        '0',
        'with space',
        'ünïcødé'
      ])
  };
};

export type Random = ReturnType<typeof createRandom>;

/**
 * Run a property over a run of seeds, reporting the seed that failed.
 *
 * A property that throws for seed 41 should say so, not say that something was
 * not equal to something else 200 iterations into an anonymous loop.
 */
export const forEachSeed = (
  count: number,
  property: (random: Random, seed: number) => void,
  firstSeed = 1
) => {
  for (let seed = firstSeed; seed < firstSeed + count; seed += 1) {
    try {
      property(createRandom(seed), seed);
    } catch (error) {
      (error as Error).message = `seed ${seed}: ${(error as Error).message}`;
      throw error;
    }
  }
};
