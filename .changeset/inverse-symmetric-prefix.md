---
'coaction': patch
---

A commit's inverse patches are now rebuilt in one more case: where a later patch
writes inside what an earlier one replaced, not only where it replaces what an
earlier one wrote inside.

Both directions make the pair unsafe to apply in the order it comes — undoing a
container before the write inside it re-applies into something already whole,
which for an `add` is one element too many. Only the first direction was
detected, so a transition of the second shape produced an inverse that could not
be applied: an undo that fails, or a sync rebase that stops rolling back.

Found by running the property suites at fifty times their usual seed count.
