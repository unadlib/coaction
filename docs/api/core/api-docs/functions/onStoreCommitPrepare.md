[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / onStoreCommitPrepare

# Function: onStoreCommitPrepare()

> **onStoreCommitPrepare**\<`T`\>(`store`, `listener`): () => `void`

Defined in: [packages/core/src/storeCommit.ts:125](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L125)

Inspect a pending object-valued commit before its patch pair is applied.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Parameters

### store

[`Store`](../interfaces/Store.md)\<`T`\>

### listener

`StoreCommitPrepareListener`\<`T`\>

## Returns

> (): `void`

### Returns

`void`

## Remarks

Return `true` to request an exact state replacement for transitions whose
object graph cannot be represented safely by the patch pair.
