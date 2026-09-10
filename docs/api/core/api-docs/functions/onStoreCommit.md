[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / onStoreCommit

# Function: onStoreCommit()

> **onStoreCommit**\<`T`\>(`store`, `listener`): () => `void`

Defined in: [packages/core/src/storeCommit.ts:99](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L99)

Observe patch pairs after successful Coaction commits.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Parameters

### store

[`Store`](../interfaces/Store.md)\<`T`\>

### listener

`StoreCommitListener`\<`T`\>

## Returns

> (): `void`

### Returns

`void`

## Remarks

Registering a listener enables patch generation only while it is needed,
even when the store was created without `enablePatches: true`.

This is how middleware should watch transitions: it sees every one of them,
whatever produced it, including those that never go through `store.apply`.
Commit listeners run before ordinary subscriptions and effects. A reentrant
write finishes delivery of the preceding commit before changing state again.
Observer errors are rethrown after commit delivery and subscription delivery;
they do not roll back a state transition that already committed.
