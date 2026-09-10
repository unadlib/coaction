[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / replayStorePatches

# Function: replayStorePatches()

> **replayStorePatches**\<`T`\>(`store`, `transition`, `options?`): `T`

Defined in: [packages/core/src/storeCommit.ts:203](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L203)

Replay a patch pair through Coaction validation, patch middleware, adapters,
subscriptions, and transports.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Parameters

### store

[`Store`](../interfaces/Store.md)\<`T`\>

### transition

[`StorePatchTransition`](../type-aliases/StorePatchTransition.md)

### options?

[`StorePatchReplayOptions`](../type-aliases/StorePatchReplayOptions.md)\<`T`\> = `{}`

## Returns

`T`
