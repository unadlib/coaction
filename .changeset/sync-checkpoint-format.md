---
'@coaction/sync': minor
---

The durable checkpoint and the pre-hydration journal now carry a
`formatVersion`, and both are read as untrusted input rather than asserted into
shape.

A checkpoint written by a build with a newer format is refused and left exactly
where it is: what is in it are writes somebody made, and guessing at them is
worse than telling the application it cannot read them. A checkpoint that is not
JSON, or whose outbox holds a malformed mutation, is refused the same way --
hydration rejects, `sync.flush()` and `sync.pull()` surface it, and status goes
to `error`. Previously such data flowed into the replay and failed much further
in, as an error about patches rather than about where they came from.

A partly-valid outbox is refused whole rather than filtered. The mutations are a
sequence of deltas, so replaying the survivors of a bad one rebuilds a different
state than the user left, without saying so.

Checkpoints written before `formatVersion` existed are read as format 1, which
is what they are. No migration is needed.
