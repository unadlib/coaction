# Upgrading to Mutative 2

Coaction 4.1 depends on [Mutative 2.0](https://mutative.js.org/blog/releases/2.0/),
and `@coaction/history` on Travels 3, which requires Mutative 2. No Coaction API
changed. The changes below come from Mutative and show at the edges of a store:
in the patches its commits carry, in production errors, and in how bundles load
Mutative. Mutative's own
[migration guide](https://mutative.js.org/docs/advanced-guides/migration-v2/)
lists every change since 1.3.0.

## Nothing to do for most applications

Coaction declares Mutative as a dependency, so installing Coaction installs
Mutative 2. If your store uses `create`, `setState`, actions, selectors and
computed getters, does not compare patch arrays, and is bundled with
`process.env.NODE_ENV` defined, there is nothing to change.

## Installing next to other Mutative libraries

If your application imports `mutative` itself, for its `Draft` type or its own
`create()` and `apply()`, upgrade it to 2.0, so that one copy is installed and
its types match the drafts Coaction hands to recipes.

`@coaction/history` depends on `travels@^3.0.1`, which declares `mutative@^2.0.0`
as a peer dependency. npm 7 and later stop with `ERESOLVE` when the application
also installs a library that declares Mutative 1 as its peer, such as
`zustand-mutative` 1 or `travels` 2. Install versions that accept Mutative 2,
such as `zustand-mutative` 2 and `travels` 3, or stay on Coaction 4.0 until they
do.

## Patches

Commits carry the patches Mutative 2 produces: `onStoreCommit` listeners,
`store.patch` middleware, `@coaction/logger`, `getPatches()` of
`@coaction/history`, and the outbox of `@coaction/sync` see them.

- The patches of a nested value come before those of its parents, the order
  Immer uses.
- A draft that a recipe moves to another key or position is carried by the
  patches of its parent instead of patches under the path it left.
- A changed item of a Set that also gained or lost items is carried by the
  Set's `remove` and `add` patches.

Applying the patches reaches the same state as before, and inverse patches undo
them in order. Tests that compare patch arrays may need new expectations.
Patches recorded by Coaction 4.0, such as those in a persisted sync outbox,
still apply.

Coaction 4.0 replaced the changed top-level keys when a recipe drafted a nested
value, moved it within its array and then wrote into it, because Mutative 1
recorded that write at the position the value had left. Mutative 2 records it
correctly, so such a commit now carries Mutative's own element patches. Coaction
still replaces the changed top-level keys when patches cannot reproduce the
state exactly, for example when a recipe deletes a key and assigns it again,
which moves the key to the end of the object.

## Production builds

Production builds of Mutative throw `Minified Mutative error #<code>` with a link
to the [errors page](https://mutative.js.org/docs/extra-topics/errors) instead of
the full message. That applies to errors Mutative throws inside a `set()` recipe
and when Coaction applies patches. For example, when a remote push returns a
patch whose target does not exist, `flush()` of `@coaction/sync` rejects with
`Minified Mutative error #14` in production, and with
`Cannot apply patch at 'missing/value'.` in development. Match error codes, not
messages, in code that runs in production.

Mutative selects its development or production build from
`process.env.NODE_ENV`:

- Define `process.env.NODE_ENV` in every bundle, including bundles for Node.js,
  or keep `mutative` external. A bundle for Node.js without it includes both
  CommonJS builds.
- In Node.js, the ESM entries of Coaction load Mutative's CommonJS build, so
  `import` and `require` share one Mutative instance, which follows
  `NODE_ENV`.
- In a browser without a bundler, such as an import map pointing at the
  published files, the default ESM file of Mutative reads `process` and fails
  with `process is not defined`. Map `mutative` to
  `mutative/dist/mutative.esm.production.min.mjs` instead.

Mutative 2 targets ES2018. Coaction's own output already uses newer syntax, so
the engines Coaction supports are unchanged.

## Drafts in recipes

Development builds of Mutative 2 check more of the draft contract:

- Consume the iterators of a Map or Set draft, such as `values()` and
  `entries()`, while the draft is active. After `set()` returns, they throw a
  `TypeError`.
- A draft used as a Map key, as in `this.byOwner.set(this.owner, value)`, throws
  in development. Use an id, or `original()` or `current()` of the draft, as the
  key.

## What did not change

Coaction's public API, the JSON contracts of shared transport and remote
synchronization, the wire protocol, and the local graph contract described in
[the core runtime notes](../architecture/core-runtime.md#draft-editing-and-complete-graph-replacement).
