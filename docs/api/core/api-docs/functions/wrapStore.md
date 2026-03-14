[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / wrapStore

# Function: wrapStore()

> **wrapStore**\<`T`\>(`store`, `getState?`): [`StoreReturn`](../type-aliases/StoreReturn.md)\<`T`\>

Defined in: [src/wrapStore.ts:12](https://github.com/unadlib/coaction/blob/main/packages/core/src/wrapStore.ts#L12)

Convert a store object into Coaction's callable store shape.

## Type Parameters

### T

`T` _extends_ `object`

## Parameters

### store

[`Store`](../interfaces/Store.md)\<`T`\>

### getState?

(...`args`) => `T`

## Returns

[`StoreReturn`](../type-aliases/StoreReturn.md)\<`T`\>

## Remarks

Framework bindings use this to attach selector-aware readers while
preserving the underlying store API on the returned function object. Most
applications should call [create](../variables/create.md) instead of using `wrapStore()`
directly.
