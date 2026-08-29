[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / LocalCreator

# Type Alias: LocalCreator()

> **LocalCreator** = \{\<`T`\>(`createState`, `options`): `StoreReturn`\<`T`\>; \<`T`\>(`createState`, `options?`): `StoreReturn`\<[`SliceState`](SliceState.md)\<`T`\>\>; \<`T`\>(`createState`, `options?`): `StoreReturn`\<`T`\>; \}

Defined in: [packages/core/src/interface.ts:530](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L530)

Overload set for the transport-free `coaction/local` create function.

## Call Signature

> \<`T`\>(`createState`, `options`): `StoreReturn`\<`T`\>

### Type Parameters

#### T

`T` _extends_ [`ISlices`](ISlices.md)\<`any`\>

### Parameters

#### createState

`T`

#### options

`SingleLocalStoreOptions`\<`T`\>

### Returns

`StoreReturn`\<`T`\>

## Call Signature

> \<`T`\>(`createState`, `options?`): `StoreReturn`\<[`SliceState`](SliceState.md)\<`T`\>\>

### Type Parameters

#### T

`T` _extends_ `Record`\<`PropertyKey`, [`Slice`](Slice.md)\<`any`\>\>

### Parameters

#### createState

`T`

#### options?

[`LocalStoreOptions`](LocalStoreOptions.md)\<`T`\>

### Returns

`StoreReturn`\<[`SliceState`](SliceState.md)\<`T`\>\>

## Call Signature

> \<`T`\>(`createState`, `options?`): `StoreReturn`\<`T`\>

### Type Parameters

#### T

`T` _extends_ [`ISlices`](ISlices.md)\<`any`\>

### Parameters

#### createState

`T` | [`Slice`](Slice.md)\<`T`\>

#### options?

[`LocalStoreOptions`](LocalStoreOptions.md)\<`T`\>

### Returns

`StoreReturn`\<`T`\>
