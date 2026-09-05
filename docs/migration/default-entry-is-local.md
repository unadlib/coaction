# `coaction` is the local runtime

`coaction` used to reach the transport runtime, so `data-transport` -- 27 KB
minified -- landed in every bundle that imported it, whether or not a Worker was
ever created. The default now means what almost every application actually
wants: a store that lives in one JavaScript context.

## What changed

| Before                      | After                                |
| --------------------------- | ------------------------------------ |
| `coaction/local`            | `coaction`                           |
| `coaction` (shared-capable) | `coaction/shared`                    |
| `coaction/shared`           | `coaction/shared` (unchanged)        |
| `@coaction/react/local`     | `@coaction/react`                    |
| `@coaction/react`           | `@coaction/react` (unchanged)        |
| `@coaction/react/shared`    | `@coaction/react/shared` (unchanged) |

`coaction/adapter` is unchanged.

## Migrating

**If you never used workers or transports**, and you imported `coaction`, there
is nothing to do -- except that your bundle gets smaller. If you imported
`coaction/local`, drop the `/local`.

**If you create a shared store or a client mirror** -- anything passing `worker`,
`transport`, `clientTransport`, `transportPolicy` or `share` -- import `create`
from `coaction/shared`:

```diff
-import { create } from 'coaction';
+import { create } from 'coaction/shared';

 const store = create(() => ({ count: 0 }), { worker: new Worker(url) });
```

Passing a transport option to the default entry throws with the entry to switch
to, so a missed call site fails loudly rather than silently losing its transport.

## What the default entry still gives you

Everything except transports. `create`, `whole`, `onStoreReady`, `wrapStore`,
the `alien-signals` primitives, and the patch and schema helpers
(`applyPatches`, `sanitizePatches`, `assertSafePatches`, `sanitizeInitialStateValue`,
`sanitizeReplacementState`, `StateSchemaError`, `isStateSchemaError`,
`UnsafePatchPathError`) are all published from `coaction`.

Types are erased, so the type surface stays whole: `StoreOptions`, `Asyncify`
and the rest are on the default entry. Only `ClientStoreOptions`,
`TransportPolicy` and `TransportPolicyRequest` are exclusive to
`coaction/shared`, along with the one value the default entry gives up --
`ActionAuthorityChangedError`, which reports a client-mode failure that cannot
occur without a transport.

## Values cross entries, objects do not cross bundles by accident

`coaction` and `coaction/shared` are separate bundles. Import `whole` from the
same entry that created the store.
