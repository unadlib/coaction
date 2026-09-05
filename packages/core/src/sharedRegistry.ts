/**
 * Registries that must resolve to one instance across entry points.
 *
 * The entries are separate bundles with code splitting off, so a module-level
 * `WeakMap` becomes one map per bundle and a value crossing an entry boundary
 * -- a public state object made by `coaction/local` and read through
 * `coaction/adapter` -- is recognised by nobody. Source tests cannot see it:
 * they alias every entry to one file. `scripts/check-entry-runtime-interop.mjs`
 * runs against `dist` and explains the failure mode in full.
 *
 * The global symbol registry is what `lifecycle.ts` and `storeCommit.ts`
 * already use for their per-store runtimes. Bump the version in the key when a
 * map's contract changes.
 */
const registryKey = Symbol.for('coaction.sharedRegistry.v1');

type SharedRegistry = {
  /** Public readonly value -> the reactive paths it is reachable at. */
  publicStatePathMeta: WeakMap<object, unknown>;
  /** Readonly proxy -> the immutable object it wraps. */
  readonlyProxySource: WeakMap<object, object>;
  /** Store internals -> immutable source object -> its readonly proxy. */
  readonlyProxyCache: WeakMap<object, WeakMap<object, object>>;
  /** Reactive subscriber -> the path nodes it currently depends on. */
  reactiveSubscribers: WeakMap<object, unknown>;
};

const globalHolder = globalThis as unknown as Record<symbol, unknown>;

export const sharedRegistry = (globalHolder[registryKey] ??= {
  publicStatePathMeta: new WeakMap<object, unknown>(),
  readonlyProxySource: new WeakMap<object, object>(),
  readonlyProxyCache: new WeakMap<object, WeakMap<object, object>>(),
  reactiveSubscribers: new WeakMap<object, unknown>()
} satisfies SharedRegistry) as SharedRegistry;
