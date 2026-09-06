---
'coaction': patch
---

`store.apply(state, patches)` now refuses a `state` that is not the one the
store holds.

A patch pair describes a change to the current state — that is what the pair
means and what the commit built from it says. Applying it to something else
leaves the store somewhere its own commits do not lead: `apply({ a: 10, b: 0 },
[b → 1])` on `{ a: 0, b: 0 }` produces `{ a: 10, b: 1 }` while the commit replays
to `{ a: 0, b: 1 }`, and nothing reading commits can tell.

`Store.apply` was always documented as applying patches to the current state, so
the supported forms are unchanged: omit `state`, or pass `getPureState()`.
