[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / ClientStoreOptions

# Type Alias: ClientStoreOptions\<T\>

> **ClientStoreOptions**\<`T`\> = `object` & [`ClientTransportOptions`](../interfaces/ClientTransportOptions.md)

Defined in: [src/interface.ts:322](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L322)

Options for creating a client mirror of a shared store.

## Type Declaration

### middlewares?

> `optional` **middlewares**: [`Middleware`](Middleware.md)\<`T`\>[]

Middleware chain applied to the client-side store wrapper.

### name?

> `optional` **name**: `string`

The name of the shared store to connect to.

### sliceMode?

> `optional` **sliceMode**: `"auto"` \| `"slices"` \| `"single"`

Control how `createState` should be interpreted.

#### Remarks

- auto: infer from createState shape. Object maps whose values are all
  functions are ambiguous, so prefer setting `sliceMode` explicitly.
- slices: force slices mode.
- single: force single-store mode.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Remarks

Methods on the returned store become promise-returning methods because
execution happens on the main/shared store.
