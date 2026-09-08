[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / derivePath

# Function: derivePath()

> **derivePath**\<`T`, `P`\>(`store`, `path`, `options?`): [`Derived`](../type-aliases/Derived.md)\<[`PathValue`](../type-aliases/PathValue.md)\<`T`, `P`\>\>

Defined in: [packages/core/src/derived.ts:254](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L254)

Cache a state-data path without collecting intermediate object reads.

## Type Parameters

### T

`T` _extends_ `object`

### P

`P` _extends_ readonly `PropertyKey`[]

## Parameters

### store

`StoreReader`\<`T`\>

### path

`P`

### options?

[`DerivedOptions`](../type-aliases/DerivedOptions.md)\<[`PathValue`](../type-aliases/PathValue.md)\<`T`, `P`\>\> = `{}`

## Returns

[`Derived`](../type-aliases/Derived.md)\<[`PathValue`](../type-aliases/PathValue.md)\<`T`, `P`\>\>

## Remarks

Import from `coaction/derived`. Missing paths return undefined. The path is
copied at creation; use `derive` for dynamic selection or native getters.
Values stay readonly outside recipes. Reads inside recipes see the draft
without changing the committed cache. Dispose the read when no longer needed;
store.destroy() also disposes it. This API supports native immutable stores.
