---
'coaction': patch
---

Reading a computed getter after a write is an order of magnitude faster again.

A getter reads state through a frozen snapshot of the subtree it touches, cached
by object identity, and a write makes the containers along the change new
objects. Carrying the snapshot forward along the patch paths is proportional to
the change; rebuilding it is proportional to whatever the getter can reach.

The maintenance existed, in the `setState` fast path — which a store with
reactive path nodes cannot take, and reading a getter is what creates those
nodes. So it stopped running the moment the feature it serves was used, and
nothing reported it: every value stayed correct and the cost went up. It now
runs at the commit point, which every write passes.

On a store of a thousand items, a getter summing them goes from 3,837 reads a
second to 41,972; one reading a single field of four thousand items goes from
1,043 to 34,413, and no longer gets slower as the array grows.
