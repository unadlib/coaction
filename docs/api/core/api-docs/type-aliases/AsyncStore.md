[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / AsyncStore

# Type Alias: AsyncStore\<T, D\>

> **AsyncStore**\<`T`, `D`\> = [`Store`](../interfaces/Store.md)\<[`Asyncify`](Asyncify.md)\<`T`, `D`\>\> & () => [`Asyncify`](Asyncify.md)\<`T`, `D`\>

Defined in: [packages/core/src/interface.ts:394](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L394)

Store shape returned by [create](../variables/create.md) when acting as a client of a shared
store.

## Type Parameters

### T

`T` _extends_ `object`

### D

`D` _extends_ `true` \| `false` = `false`

## Remarks

Methods return promises because they execute on the main/shared store.
