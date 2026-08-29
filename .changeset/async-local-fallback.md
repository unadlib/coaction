---
'coaction': minor
---

Add an explicit, contract-safe local fallback for client stores. Passing `worker: undefined` or `clientTransport: undefined` now keeps `getState()` actions promise-based, defers their effects until the promise job runs, and enforces the shared JSON contract for state, arguments, and results. Client option overloads now preserve that async type through object spreads, while `getInitialState()` accurately retains the original synchronous initialization shape.
