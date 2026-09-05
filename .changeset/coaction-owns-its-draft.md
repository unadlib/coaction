---
'coaction': major
'@coaction/history': minor
---

Coaction produces and applies its own transitions. Mutative is no longer a
dependency of any package.

Nothing about writing state changes. `set(() => { this.count += 1 })` still
means what it meant, and every package passes unchanged — because the draft was
replaced rather than removed. Narrowing the patch domain to plain objects and
dense arrays is what made that possible: over that tree the mechanism a draft
needs is small, where a general-purpose immutable library also carries `Map`,
`Set`, class instances and custom immutability marks, none of which a Coaction
transition can describe. A node is copied the first time it is written and the
copy is linked into its parent's, so nothing is copied until it is written to
and an untouched branch keeps its identity.

Measured on a bundled application, gzipped: a React app goes from 18,007 B to
12,914 B, and a vanilla store from 16,063 B to 10,971 B — around five kilobytes,
about a third.

A patch path segment is now a `PropertyKey`. The store supports symbol-keyed
state and applies state through patches, so a path that could not name a symbol
silently dropped such a write. The shared transport still refuses symbol keys,
which is a JSON boundary check rather than a limit on what a transition can
describe.

`coaction/adapter` publishes the producers — `scopeDraft`, `openDraft`,
`applyPatches`, `diffPatches`, `producePatches` — and `check-package-quality`
fails on any shipped module importing Mutative. It stays a development
dependency, because the tests that matter for the draft, the applier and the
diff are the ones comparing against it.

The draft holds the guarantees the abstraction implies, each one reproduced
before it was fixed: a finalized draft is dead rather than a live handle on the
published state; an array's own mutating methods produce transitions whose
inverse returns exactly to the base, checked over four thousand generated
mutation sequences; a `Map`, `Set` or `Date` cannot be edited through a draft,
because a patch cannot describe a change inside one; `defineProperty`,
`setPrototypeOf` and `preventExtensions` are refused instead of reaching the
base; and copying preserves array holes, an array's own properties, and a
null prototype. Each refusal raises `UnsupportedDraftOperationError`.

A second hardening pass closed the ways a draft could still reach past its own
boundary: a draft riding into the published state inside a container built by
`slice()` or a spread; filling an array hole or deleting an index, which as
patches meant insert and close-the-gap rather than what they do; array methods
that answer with the array itself handing back an untracked copy; elements taken
out by `pop` or `splice` still being the base's objects; and a leaf boundary
written as a list of five types, which missed typed arrays and everything else
with internal slots while wrongly excluding objects that merely have a prototype
of their own.

The invariants are now checked over twenty thousand generated mutation
sequences: the base is never modified, no draft reaches the state, the patches
produce the state, the inverse returns to the base, and untouched branches keep
their identity.
