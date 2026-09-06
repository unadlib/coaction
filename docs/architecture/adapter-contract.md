# External Store Adapter Contract

This contract applies to whole-store adapters created with
`defineExternalStoreAdapter()` from `coaction/adapter`. `createBinder()` is the
compatibility alias. Binder-backed adapters cannot be nested inside Coaction
slices.

Framework wrappers and middleware that leave Coaction in ownership of state are
not binder-backed adapters.

## Adapter hooks

`defineExternalStoreAdapter()` accepts two hooks:

### `handleState(state)`

Return:

- `copyState`: the state object Coaction will inspect during initialization;
- `bind(state)`: a function that produces the raw state used by Coaction;
- optional `key`: a child key when the external runtime wraps its real state.

Do not mutate caller-owned input while preparing `copyState`.

### `handleStore(store, rawState, state, internal, key)`

Connect the external runtime to the initialized Coaction store. This is where
an adapter installs subscriptions, overrides supported store methods, and
registers cleanup.

## Required behavior

An official adapter must:

- preserve `getState()`, `setState()`, `subscribe()`, `apply()`,
  `getPureState()`, and `destroy()` semantics;
- notify Coaction subscribers after an external write;
- call `internal.notifyStateChange()` when it assigns
  `internal.rootState` without going through `setState()` or `apply()`;
- release external subscriptions and observers from `destroy()`;
- keep cleanup idempotent;
- document whether out-of-band external writes are rejected, restored, or
  ignored when they introduce unknown root keys.

An adapter may replace store methods, but the resulting object must remain a
valid Coaction store and compose with middleware.

`store.apply` belongs to Coaction, for every store. An adapter says how to
write a change into its own runtime by setting `internal.externalApply`, and
that is the whole of its job at this boundary: Coaction works out the patch pair
before the change, runs commit validators, calls the writer, and publishes the
commit.

An adapter used to replace `store.apply` outright, which handed it commit
semantics it did not want. None of them published a commit, so `store.apply()`
on a MobX, Valtio or Pinia store changed the state and told nobody; putting the
pipeline back around whatever they installed then produced three separate ways
to publish the same transition twice. And because middleware runs before the
binder, replacing `apply` silently discarded anything middleware had wrapped it
with.

### Middleware and the apply boundary

Middleware runs before the binder, and `store.apply` is public API. A middleware
that wraps it — to log it, to inspect the patches — now keeps working on a store
built through any binder, because the binder no longer replaces it.

`onStoreCommit` is still the better hook for observing transitions: it sees
every one of them whatever produced it, including the ones that never go through
`apply` at all.

## Async actions on a mutable instance

Patch generation for a mutable instance works by opening a mutative draft over
`internal.rootState` for the duration of an action. There is one
`internal.rootState`, so there is one open transaction at a time, and an async
action holds its open across every `await`.

A second action entered in that window closes the open transaction — publishing
what the first action had written so far as its own commit — and opens one of
its own. Only the action that opened a transaction may close it, so the first
one, on resume, does not touch the second one's draft.

What follows is the contract for overlapping async actions:

- Every write from every action lands, once each, in the order it was made.
- An action's writes **before** its first `await` are its own commit. Its
  writes **after** an `await` join whichever transaction is open at that
  moment, and are published in that commit.
- Commit boundaries therefore do not line up with action boundaries while two
  async actions overlap. A patch consumer — `@coaction/sync`,
  `@coaction/history`, `@coaction/logger` — sees a coherent patch stream, but
  not one commit per action.

An adapter needs no code for this; it is core behavior, and it is the same for
every mutable instance. Native Coaction stores are unaffected: their actions do
not hold a draft across an `await`.

A refusal belongs to the action whose writes were refused. Closing a transaction
runs commit validators, and an action entering while another is suspended closes
that one's first — so the refusal can be raised while a different action is on
the stack. It is held against the action it came from and surfaces on that
action's own result; the one that found it carries on. What was refused is
already rolled back, because the state is restored before the validators run.

Because an action writes into the draft and `store.apply` is what puts the
change onto the instance, an action is a transition Coaction can still refuse.
A commit validator registered with `onStoreCommitValidate` runs before that
apply, and throwing leaves the instance holding what it held before the action
ran. Mutation made on the instance directly, outside an action, is the case that
has no such point.

## Shared stores

Shared replacement input is validated before adapter code reads or normalizes
it. An adapter must not make unsupported input appear valid by invoking
accessors or dropping fields.

An adapter may keep proxies or accessors in its local external instance, but it
must expose a plain JSON snapshot for transport. Patches and replacement state
must pass the same schema, JSON, and unsafe-path checks as native stores.

The main store remains the only authority. Shared-client support for Coaction
method calls does not imply that direct writes to the client-side external
instance are supported. Each adapter must explicitly guard and document such
writes before they become part of its contract.

See the [support matrix](./support-matrix.md) for the currently maintained modes
of each official adapter.
