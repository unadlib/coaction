[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StorePatchReplayOptions

# Type Alias: StorePatchReplayOptions\<T\>

> **StorePatchReplayOptions**\<`T`\> = `object`

Defined in: [packages/core/src/storeCommit.ts:27](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L27)

## Type Parameters

### T

`T` _extends_ `CreateState` = `CreateState`

## Properties

### setState?

> `optional` **setState**: [`Store`](../interfaces/Store.md)\<`T`\>\[`"setState"`\]

Defined in: [packages/core/src/storeCommit.ts:29](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L29)

Middleware-scoped setState entry that should observe the replay.
