/**
 * The transition format every part of Coaction speaks.
 *
 * A commit carries patches and their inverses, and history, sync, the shared
 * transport and reactive invalidation all read them. That makes this the
 * protocol between those systems, not an implementation detail of whichever
 * producer happened to generate the transition -- and the semantics that have
 * needed fixing (what a truncating `length` write invalidates, how an inverse
 * restores removed elements, which paths are refused) are decided here rather
 * than inherited.
 *
 * Structurally compatible with what general-purpose immutable libraries emit,
 * so a transition can come from somewhere other than the built-in producer.
 *
 * A path traverses plain objects and dense arrays, and nothing else. A `Date`,
 * a `Map`, a `Set` or an instance of a class is a leaf: it can be replaced
 * whole, with the value going in untouched, but a patch does not describe its
 * interior, and one that tries is refused rather than turning it into a plain
 * object on the way past. Narrower than what a general immutable library can
 * patch, and it is the tree history, sync and the transport all have to agree
 * on anyway.
 */
export type PatchOperation = 'add' | 'remove' | 'replace';

export type Patch = {
  op: PatchOperation;
  /**
   * Array form, or an RFC 6901 pointer when a producer emits one.
   *
   * A local store may key state by symbol, so a path segment is a
   * `PropertyKey`. The shared transport refuses symbol keys separately, since
   * they have no JSON form -- that is a boundary check, not a limit on what a
   * transition can describe here.
   */
  path: PropertyKey[] | string;
  value?: unknown;
};

export type Patches = Patch[];

/**
 * `0`, `1`, `2`… — a position in a sequence, not a property that looks like
 * one. The ceiling is the language's: an array cannot hold an index at
 * `2 ** 32 - 1`, so that and anything above it are ordinary keys.
 *
 * One definition, because the draft, the applier and the diff have to agree
 * about which keys mean "position" or they describe different arrays.
 */
const maxArrayIndex = 2 ** 32 - 2;

export const asArrayIndex = (key: PropertyKey) => {
  if (typeof key === 'number') {
    return Number.isInteger(key) && key >= 0 && key <= maxArrayIndex
      ? key
      : undefined;
  }
  if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return undefined;
  const index = Number(key);
  return index <= maxArrayIndex ? index : undefined;
};

/**
 * Values a patch path may traverse: arrays, and objects made of nothing but
 * properties.
 *
 * "Nothing but properties" means the whole prototype chain is plain — so an
 * object built with `Object.create` over a plain prototype is included, since
 * that is ordinary Coaction state. Anything a constructor built is not: a
 * `Map` keeps its entries in internal slots, a `URL` in private fields, an
 * `Error` in non-enumerable properties its prototype expects. Copying one by
 * its properties produces something that is no longer that thing, so a patch
 * does not describe its interior and it is replaced whole instead.
 *
 * Deliberately narrow. A boundary that can be stated in a sentence is one that
 * cannot silently corrupt state, which matters more here than covering every
 * shape JavaScript can express.
 */
export const isPatchTraversable = (value: unknown): value is object => {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  let prototype: unknown = Object.getPrototypeOf(value);
  while (prototype !== null) {
    if (prototype === Object.prototype) return true;
    if (
      typeof prototype !== 'object' ||
      Object.getOwnPropertyDescriptor(prototype, 'constructor') !== undefined
    ) {
      return false;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return true;
};
