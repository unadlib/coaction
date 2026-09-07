[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Slices

# Type Alias: Slices()\<T, K\>

> **Slices**\<`T`, `K`\> = (`set`, `get`, `store`) => `T`\[`K`\]

Defined in: [packages/core/src/interface.ts:279](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L279)

Factory for a named slice inside a slices store.

## Type Parameters

### T

`T` _extends_ [`ISlices`](ISlices.md)

### K

`K` _extends_ keyof `T`

## Parameters

### set

[`Store`](../interfaces/Store.md)\<`T`\>\[`"setState"`\]

### get

`Getter`\<`T`\>

### store

[`Store`](../interfaces/Store.md)\<`T`\>

## Returns

`T`\[`K`\]

## Remarks

The returned object becomes the value stored under the slice key. When an
object input only contains functions, prefer explicit `sliceMode` to avoid
ambiguity between slices and a plain method-only store.
