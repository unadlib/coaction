---
'coaction': patch
---

Hand the deprecated `store.patch` hook copies of the patch pair. Patch values
are objects of the states on either side of a transition: after a recipe moves
an element, as `reverse()` or `splice()` does, an inverse value is an element
the next state still holds. A hook that edited a value in place therefore
rewrote the committed state, and the previous one, without a notification.
Edits a hook makes to the patches it returns still apply.
