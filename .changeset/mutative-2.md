---
'coaction': minor
'@coaction/history': minor
'@coaction/mobx': minor
'@coaction/pinia': minor
'@coaction/valtio': minor
---

Coaction depends on Mutative 2.0, and `@coaction/history` on Travels 3.0.1,
which requires Mutative 2. No Coaction API changed.

Commits carry the patches Mutative 2 produces. The patches of a nested value
come before those of its parents, and a draft that a recipe moves is carried by
the patches of its parent instead of patches under the path it left. They
replay to the same state, and inverse patches undo them in order; tests that
compare patch arrays may need new expectations. A recipe that drafts a nested
value, moves it within its array and then writes into it now commits Mutative's
element patches instead of replacing the changed top-level keys.

Production builds of Mutative throw `Minified Mutative error #<code>` instead of
the message, also for patches that `@coaction/sync` cannot apply. Mutative
selects its build from `process.env.NODE_ENV`, so define it in every bundle.

npm stops with `ERESOLVE` when an application installs `@coaction/history` next
to a library that declares Mutative 1 as its peer, such as `zustand-mutative` 1
or `travels` 2. Upgrade those libraries to versions that accept Mutative 2.

`@coaction/mobx`, `@coaction/pinia` and `@coaction/valtio` no longer install
`mutability`, which they stopped using when patches began to apply through
mutable snapshots, and which declares Mutative 1 as its peer.

See `docs/migration/mutative-2.md`.
