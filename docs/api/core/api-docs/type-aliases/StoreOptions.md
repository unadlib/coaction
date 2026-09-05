[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreOptions

# Type Alias: StoreOptions\<T\>

> **StoreOptions**\<`T`\> = `object`

Defined in: [packages/core/src/interface.ts:294](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L294)

Options for creating a local store or the main side of a shared store.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Properties

### enablePatches?

> `optional` **enablePatches**: `boolean`

Defined in: [packages/core/src/interface.ts:321](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L321)

Enable patch generation.

#### Remarks

Required for async client stores and useful for middleware or mutable
integrations that depend on patch streams.

---

### middlewares?

> `optional` **middlewares**: [`Middleware`](Middleware.md)\<`T`\>[]

Defined in: [packages/core/src/interface.ts:313](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L313)

Middleware chain applied before the initial state is finalized.

---

### name?

> `optional` **name**: `string`

Defined in: [packages/core/src/interface.ts:298](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L298)

The name of the store.

---

### sliceMode?

> `optional` **sliceMode**: `"auto"` \| `"slices"` \| `"single"`

Defined in: [packages/core/src/interface.ts:331](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L331)

Control how `createState` should be interpreted.

#### Remarks

- auto: infer from createState shape. Object maps whose values are all
  functions are ambiguous, so prefer setting `sliceMode` explicitly.
- slices: force slices mode.
- single: force single-store mode.

---

### transport?

> `optional` **transport**: `Transport`

Defined in: [packages/core/src/interface.ts:307](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L307)

Inject a pre-built transport for advanced shared-store setups.

---

### transportPolicy?

> `optional` **transportPolicy**: [`TransportPolicy`](TransportPolicy.md)

Defined in: [packages/core/src/interface.ts:309](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L309)

Restrict requests accepted by a shared-main store.

---

### ~~workerType?~~

> `optional` **workerType**: `"SharedWorkerInternal"` \| `"WebWorkerInternal"`

Defined in: [packages/core/src/interface.ts:303](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L303)

#### Deprecated

Internal worker-mode override retained for compatibility.
Prefer passing `transport` or letting the runtime infer the environment.
