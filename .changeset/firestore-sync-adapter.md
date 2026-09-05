---
'@coaction/sync': minor
---

Add `@coaction/sync/firestore`, syncing a keyed collection with a Firestore
collection.

Built on the CRUD adapter. What it adds is the part that is easy to get wrong: a
Firestore document does not contain its own id, so the id is merged into the
record on read and stripped again on write, and a `docChanges()` batch becomes
one patch per change.

Firestore's modular API is tree-shakable functions rather than methods, so they
are passed in as `firestore: { getDocs, doc, setDoc, deleteDoc, onSnapshot }`,
which also keeps `firebase` out of this package's dependencies. `collection` may
be a `Query` rather than a whole collection when only part of it should sync.
