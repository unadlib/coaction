[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / StoreOptions

# Type Alias: StoreOptions\<T\>

> **StoreOptions**\<`T`\> = `object`

Defined in: [src/interface.ts:277](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L277)

Options for creating a local store or the main side of a shared store.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Properties

### enablePatches?

> `optional` **enablePatches**: `boolean`

Defined in: [src/interface.ts:302](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L302)

Enable patch generation.

#### Remarks

Required for async client stores and useful for middleware or mutable
integrations that depend on patch streams.

---

### middlewares?

> `optional` **middlewares**: [`Middleware`](Middleware.md)\<`T`\>[]

Defined in: [src/interface.ts:294](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L294)

Middleware chain applied before the initial state is finalized.

---

### name?

> `optional` **name**: `string`

Defined in: [src/interface.ts:281](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L281)

The name of the store.

---

### sliceMode?

> `optional` **sliceMode**: `"auto"` \| `"slices"` \| `"single"`

Defined in: [src/interface.ts:312](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L312)

Control how `createState` should be interpreted.

#### Remarks

- auto: infer from createState shape. Object maps whose values are all
  functions are ambiguous, so prefer setting `sliceMode` explicitly.
- slices: force slices mode.
- single: force single-store mode.

---

### transport?

> `optional` **transport**: `Transport`

Defined in: [src/interface.ts:290](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L290)

Inject a pre-built transport for advanced shared-store setups.

---

### ~~workerType?~~

> `optional` **workerType**: `"SharedWorkerInternal"` \| `"WebWorkerInternal"`

Defined in: [src/interface.ts:286](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L286)

#### Deprecated

Internal worker-mode override retained for compatibility.
Prefer passing `transport` or letting the runtime infer the environment.
