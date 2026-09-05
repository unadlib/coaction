[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / wrapStore

# Function: wrapStore()

> **wrapStore**\<`T`\>(`store`, `getState?`): `StoreReturn`\<`T`\>

Defined in: [packages/core/src/wrapStore.ts:13](https://github.com/coactionjs/coaction/blob/main/packages/core/src/wrapStore.ts#L13)

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

`StoreReturn`\<`T`\>

## Remarks

Framework bindings use this to attach selector-aware readers while
preserving the underlying store API on the returned function object. Most
applications should use a public `create` entry instead of calling
`wrapStore()` directly. Framework authors import this helper from
`coaction` or `coaction/adapter`.
