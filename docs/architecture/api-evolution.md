# API Evolution

This document defines the maintenance boundary for `create()`.

## Current Boundary

`create()` already carries multiple semantics:

- single store vs slices store
- local store vs shared main store vs shared client store
- transport-backed sharing vs worker-backed client creation
- compatibility-only `workerType` overrides

That surface is large enough. Future feature work should not keep expanding
`create()` with more ambiguous option combinations or additional input shapes.

## Rule

Do not add new meaning to `create()` by piling more polymorphism into the same
entry point.

Prefer one of these instead:

- a new explicit helper
- a new `createXxx` variant
- a builder-style API when several new semantics need to compose

## What Stays Frozen

The following `create()` semantics are treated as the stable boundary:

- state shape selection through `sliceMode`
- main/client authority selection through `transport`, `clientTransport`,
  `worker`, and compatibility `workerType`
- async client behavior for shared mirrors

The following are compatibility knobs, not expansion points:

- `workerType: 'SharedWorkerInternal' | 'WebWorkerInternal'`
- `workerType: 'SharedWorkerClient' | 'WebWorkerClient'`

They remain supported for backward compatibility, but new features should not be
designed around adding more internal `workerType` branches.

## What To Reject

Reject combinations that blur store authority:

- main-store and client-store transport settings in the same call
- multiple client transport sources in the same call
- new overloads that require users to infer runtime mode from increasingly
  magical input shapes

## Preferred Direction

When new capability is needed, ask:

1. Is this really a new store authority model?
2. If yes, can it be an explicit helper instead of another `create()` branch?
3. If no, can it be expressed as middleware, adapter contract, or a
   package-level integration instead?

This keeps `create()` readable for maintainers and predictable for users.
