[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Getter

# Interface: Getter()\<T\>

Defined in: [src/interface.ts:202](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L202)

Helper passed into [Slice](../type-aliases/Slice.md) and [Slices](../type-aliases/Slices.md) factories.

## Remarks

Call it with no arguments to read the current store state. Call it with a
dependency selector pair to define a computed value.

## Type Parameters

### T

`T` _extends_ [`ISlices`](../type-aliases/ISlices.md)

## Call Signature

> **Getter**\<`P`, `R`\>(`getDeps`, `selector`): `R`

Defined in: [src/interface.ts:203](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L203)

Helper passed into [Slice](../type-aliases/Slice.md) and [Slices](../type-aliases/Slices.md) factories.

### Type Parameters

#### P

`P` _extends_ `any`[]

#### R

`R`

### Parameters

#### getDeps

(`store`) => readonly \[`P`\] \| \[`...P[]`\]

#### selector

(...`args`) => `R`

### Returns

`R`

### Remarks

Call it with no arguments to read the current store state. Call it with a
dependency selector pair to define a computed value.

## Call Signature

> **Getter**(): `T`

Defined in: [src/interface.ts:207](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L207)

Helper passed into [Slice](../type-aliases/Slice.md) and [Slices](../type-aliases/Slices.md) factories.

### Returns

`T`

### Remarks

Call it with no arguments to read the current store state. Call it with a
dependency selector pair to define a computed value.
