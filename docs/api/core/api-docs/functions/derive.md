[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / derive

# Function: derive()

> **derive**\<`T`, `R`\>(`store`, `selector`, `options?`): [`Derived`](../type-aliases/Derived.md)\<`R`\>

Defined in: [packages/core/src/derived.ts:248](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L248)

Create a lazy, disposable selector owned by one immutable Coaction store.

## Type Parameters

### T

`T` _extends_ `object`

### R

`R`

## Parameters

### store

`StoreReader`\<`T`\>

### selector

(`state`) => `R`

### options?

[`DeriveOptions`](../type-aliases/DeriveOptions.md)\<`R`\> = `{}`

## Returns

[`Derived`](../type-aliases/Derived.md)\<`R`\>

## Remarks

Import from `coaction/derived`. Default tracking includes object identities.
Use `{ deep: true }` for leaf/structure value selection; identity observations
then need identity(value). Returned state inside plain data wrappers is
tracked automatically. Results use Object.is equality, including NaN and -0.
Draft reads bypass the committed cache. Dispose when the owner no longer
needs this read; store.destroy() also disposes it. Selectors are synchronous
pure reads. Native getters remain the fast frozen-snapshot option for scans.
