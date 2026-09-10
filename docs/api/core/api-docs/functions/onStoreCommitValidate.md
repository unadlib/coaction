[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / onStoreCommitValidate

# Function: onStoreCommitValidate()

> **onStoreCommitValidate**\<`T`\>(`store`, `validator`): () => `void`

Defined in: [packages/core/src/storeCommit.ts:178](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L178)

Refuse a state transition before it is committed.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Parameters

### store

[`Store`](../interfaces/Store.md)\<`T`\>

### validator

`StoreCommitValidator`\<`T`\>

## Returns

> (): `void`

### Returns

`void`

## Remarks

A validator that throws aborts the transition: the error reaches whoever
called `setState`, and the store is left exactly as it was. This is the hook
for a middleware whose state space is narrower than Coaction's own -- one
that has to put the state somewhere Coaction does not, over a wire or into
storage, and so cannot represent everything a local write can produce.

Learning about such a write from [onStoreCommit](onStoreCommit.md) is too late. By then
the store holds a value the middleware cannot carry, subscribers have
rendered it, and refusing it after the fact only means the two disagree from
there on with nothing left to say so.

Every way into the state runs validators: `setState`, `store.apply()` with a
patch pair or with a replacement, a patch replay, and an action on an
external mutable instance. A replacement carries no patch pair of its own, so
the one the commit would be published with is derived and checked instead.

An action on a mutable instance counts because it writes into a draft, and
putting that onto the instance is a later step -- refusing it leaves the
object holding what it held before. The exception is mutation made on such an
object directly, outside an action, which has already happened by the time
Coaction hears about it; a middleware has only [onStoreCommit](onStoreCommit.md) for
that.

A validator sees the commit a listener will see -- the same patch pair, the
same inverse, the same source. It must not write to the store, and it runs on
every local transition, so keep it proportional to the patches rather than to
the size of the state.
