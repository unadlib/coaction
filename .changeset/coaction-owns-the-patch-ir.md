---
'coaction': minor
'@coaction/history': minor
---

Coaction owns its transition format.

A commit's patches are what `@coaction/history`, `@coaction/sync`, the shared
transport and reactive invalidation all read, which makes the format the
protocol between them. It was typed `import type { Patches } from 'mutative'` in
nine files, so the producer that generates transitions was also the definition
of what one is — while every semantic question that has come up (what a
truncating `length` write invalidates, how an inverse restores removed elements,
which paths are refused, how a pending index moves when the remote inserts ahead
of it) was already being decided and fixed in Coaction.

`Patch`, `PatchOperation` and `Patches` are now declared here and published from
the default and adapter entries, structurally compatible with what Mutative
emits. Applying patches is Coaction's implementation too, tested case by case
against the one it replaces and exercised by the whole suite, since history,
sync, the transport and six external-store adapters all push patches through it.

`coaction/adapter` publishes the two operations a middleware needs —
`applyPatches(state, patches)` and `producePatches(base, write)` — and
`@coaction/history` uses them instead of Mutative, which is no longer among its
dependencies. `check-package-quality` fails if any package other than `coaction`
imports Mutative.

Nothing about writing state changes. Mutative still produces drafts, `set(() =>
{ this.count += 1 })` still means what it meant, and no behaviour moves. What
changes is which package defines a transition.

Applying a batch copies each container once rather than once per patch. Walking
from the root per patch made a pull that returns one patch per record re-copy
the whole collection once per record: five thousand patches took five seconds,
against ten milliseconds for the implementation being replaced. It is now under
two.

A patch traverses plain objects and dense arrays only. A `Date`, a `Map`, a
`Set` or a class instance is a leaf — replaceable whole, with no interior for a
path to name — and a path that goes further raises
`UnsupportedPatchContainerError` instead of spreading it into a plain object and
losing what it was.
