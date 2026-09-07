[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / AsyncStore

# Type Alias: AsyncStore\<T, D\>

> **AsyncStore**\<`T`, `D`\> = `Omit`\<[`Store`](../interfaces/Store.md)\<[`Asyncify`](Asyncify.md)\<`T`, `D`\>\>, `"getInitialState"`\> & `object` & () => [`Asyncify`](Asyncify.md)\<`T`, `D`\>

Defined in: [packages/core/src/interface.ts:476](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L476)

Store shape returned by [create](../variables/create.md) when acting as a client of a shared
store.

## Type Declaration

### getInitialState()

> **getInitialState**: () => `T`

Return the original synchronous state shape produced at initialization.

#### Returns

`T`

## Type Parameters

### T

`T` _extends_ `object`

### D

`D` _extends_ `true` \| `false` = `false`

## Remarks

Methods return promises because they execute on the main/shared store.
