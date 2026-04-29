[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Slice

# Type Alias: Slice()\<T\>

> **Slice**\<`T`\> = (`set`, `get`, `store`) => `T`

Defined in: [packages/core/src/interface.ts:217](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L217)

Factory for a single store object.

## Type Parameters

### T

`T` _extends_ [`ISlices`](ISlices.md)

## Parameters

### set

[`Store`](../interfaces/Store.md)\<`T`\>\[`"setState"`\]

### get

`Getter`\<`T`\>

### store

[`Store`](../interfaces/Store.md)\<`T`\>

## Returns

`T`

## Remarks

Return a plain object containing state, getters, and methods. Methods and
getters may use `this` to access the live store state.
