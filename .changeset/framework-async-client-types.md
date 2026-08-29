---
'@coaction/ng': minor
'@coaction/react': minor
'@coaction/solid': minor
'@coaction/svelte': minor
'@coaction/vue': minor
---

Fix client-store type inference in framework creators. Options carrying
`worker` or `clientTransport`, including through object spreads, now preserve
the async client action types. Calls without client transport options remain
synchronous, and `getInitialState()` retains the original synchronous
initialization shape.
