[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / ClientStoreOptions

# Type Alias: ClientStoreOptions\<T\>

> **ClientStoreOptions**\<`T`\> = `object` & `ClientTransportOptions`

Defined in: [packages/core/src/interface.ts:386](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L386)

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

Passing an explicit `worker` or `clientTransport` key whose value is
`undefined` degrades to a strict local authority. Its `getState()` actions
remain promise-returning and its state, arguments, and results obey the
shared JSON contract. It is not a client mirror: tabs remain independent
and low-level local-authority mutations stay available.
