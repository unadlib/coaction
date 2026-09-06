# `store.apply` belongs to Coaction

**Coaction 4.0.** An external adapter used to replace `store.apply` with a
function that wrote into its own runtime. It now says only _how_ to write, by
setting `internal.externalApply`, and Coaction keeps the rest.

Most applications have nothing to do. This affects anyone maintaining an adapter
of their own, and anyone calling `store.apply(state, patches)` with a `state`
that is not the one the store holds.

## Why

`store.apply` was doing four jobs at once: public API, middleware extension
point, adapter extension point, and Coaction's internal commit primitive.
Replacing it took on the third and quietly broke the other three.

- **No commit was published.** `store.apply()` on a MobX, Valtio or Pinia store
  changed the state and told nobody, so `@coaction/history` had nothing to undo
  and `@coaction/sync` never queued the write.
- **Putting the commit pipeline back around what an adapter installed produced
  three separate ways to publish the same transition twice** — once for binders
  that never replaced `apply` at all, once for the delegation inside
  `applyValidatedPatches`, and once for the wrapping itself.
- **Middleware wrapping `apply` was silently discarded**, because middleware
  runs before the binder.

Splitting the write out of the commit removes the class rather than the
instances.

## If you maintain an adapter

One line, same signature:

```diff
-store.apply = (state = store.getPureState(), patches) => {
+internal.externalApply = (state = store.getPureState(), patches) => {
   // write the change into your runtime
 };
```

Do not publish a commit from it. Coaction works out the patch pair before the
change, runs commit validators, calls your writer, and publishes the commit.

If your adapter replaced `apply` only to _refuse_ a direct write — as
`@coaction/xstate` did, since an actor's context is replaced wholesale — you
need no writer at all. Refuse from `internal.assertMutationAllowed` and let the
ordinary `apply` do the work:

```ts
internal.assertMutationAllowed = (operation) => {
  if (operation === 'apply' && isApplyingSnapshot) return;
  throw new Error('State cannot be mutated directly.');
};
```

The [adapter contract](../architecture/adapter-contract.md) has the full
boundary, and `packages/core/test/binderCommitConformance.ts` is the suite every
official binder runs against.

## If you call `store.apply(state, patches)`

`state` must be the state the store holds. Omit it, or pass `getPureState()`:

```diff
-store.apply(someOtherState, patches);
+store.apply(store.getPureState(), patches);
```

A patch pair describes a change to the current state. Applied to a different
base it still applies, and the commit still says what the pair says — so the
store ends up somewhere its own commits do not lead:

```text
store holds { a: 0, b: 0 }
apply({ a: 10, b: 0 }, [b -> 1])
store now  { a: 10, b: 1 }
its commits replay to { a: 0, b: 1 }
```

Nothing downstream can tell. It is now refused instead.

The replacement form is unchanged: `store.apply(nextState)` takes any state.

## Middleware

A middleware that wraps `store.apply` now keeps working on a store built through
any binder. It used to work on a native store and vanish on a MobX, Valtio or
Pinia one.

`onStoreCommit` is still the better hook for observing transitions — it sees
every one of them, including those that never go through `apply`.
