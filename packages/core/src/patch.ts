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
 * Structurally compatible with Mutative's patches, which is what lets Mutative
 * remain one producer among possible others rather than the definition.
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
