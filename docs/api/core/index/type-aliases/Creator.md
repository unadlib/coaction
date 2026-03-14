[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / Creator

# Type Alias: Creator()

> **Creator** = \{\<`T`\>(`createState`, `options?`): [`StoreReturn`](StoreReturn.md)\<[`SliceState`](SliceState.md)\<`T`\>\>; \<`T`\>(`createState`, `options?`): [`StoreReturn`](StoreReturn.md)\<`T`\>; \<`T`\>(`createState`, `options?`): [`AsyncStore`](AsyncStore.md)\<[`SliceState`](SliceState.md)\<`T`\>, `true`\>; \<`T`\>(`createState`, `options?`): [`AsyncStore`](AsyncStore.md)\<`T`\>; \}

Defined in: [src/interface.ts:425](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L425)

Overload set for [create](../variables/create.md).

## Call Signature

> \<`T`\>(`createState`, `options?`): [`StoreReturn`](StoreReturn.md)\<[`SliceState`](SliceState.md)\<`T`\>\>

### Type Parameters

#### T

`T` _extends_ `Record`\<`string`, [`Slice`](Slice.md)\<`any`\>\>

### Parameters

#### createState

`T`

#### options?

[`StoreOptions`](StoreOptions.md)\<`T`\>

### Returns

[`StoreReturn`](StoreReturn.md)\<[`SliceState`](SliceState.md)\<`T`\>\>

## Call Signature

> \<`T`\>(`createState`, `options?`): [`StoreReturn`](StoreReturn.md)\<`T`\>

### Type Parameters

#### T

`T` _extends_ [`ISlices`](ISlices.md)\<`any`\>

### Parameters

#### createState

[`Slice`](Slice.md)\<`T`\>

#### options?

[`StoreOptions`](StoreOptions.md)\<`T`\>

### Returns

[`StoreReturn`](StoreReturn.md)\<`T`\>

## Call Signature

> \<`T`\>(`createState`, `options?`): [`AsyncStore`](AsyncStore.md)\<[`SliceState`](SliceState.md)\<`T`\>, `true`\>

### Type Parameters

#### T

`T` _extends_ `Record`\<`string`, [`Slice`](Slice.md)\<`any`\>\>

### Parameters

#### createState

`T`

#### options?

[`ClientStoreOptions`](ClientStoreOptions.md)\<`T`\>

### Returns

[`AsyncStore`](AsyncStore.md)\<[`SliceState`](SliceState.md)\<`T`\>, `true`\>

## Call Signature

> \<`T`\>(`createState`, `options?`): [`AsyncStore`](AsyncStore.md)\<`T`\>

### Type Parameters

#### T

`T` _extends_ [`ISlices`](ISlices.md)\<`any`\>

### Parameters

#### createState

[`Slice`](Slice.md)\<`T`\>

#### options?

[`ClientStoreOptions`](ClientStoreOptions.md)\<`T`\>

### Returns

[`AsyncStore`](AsyncStore.md)\<`T`\>

## Remarks

- `Slice` + `StoreOptions` returns a synchronous local or main/shared store.
- slice map + `StoreOptions` returns a synchronous slices store.
- `Slice` + `ClientStoreOptions` returns an async client store.
- slice map + `ClientStoreOptions` returns an async client slices store.

For object inputs whose enumerable values are all functions, prefer explicit
`sliceMode` to avoid ambiguous inference.
