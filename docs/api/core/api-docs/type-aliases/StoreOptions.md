[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreOptions

# Type Alias: StoreOptions\<T\>

> **StoreOptions**\<`T`\> = `object`

Defined in: [packages/core/src/interface.ts:316](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L316)

Options for creating a local store or the main side of a shared store.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Properties

### enablePatches?

> `optional` **enablePatches**: `boolean`

Defined in: [packages/core/src/interface.ts:343](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L343)

Enable patch generation.

#### Remarks

Required for async client stores and useful for middleware or mutable
integrations that depend on patch streams.

---

### middlewares?

> `optional` **middlewares**: [`Middleware`](Middleware.md)\<`T`\>[]

Defined in: [packages/core/src/interface.ts:335](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L335)

Middleware chain applied before the initial state is finalized.

---

### name?

> `optional` **name**: `string`

Defined in: [packages/core/src/interface.ts:320](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L320)

The name of the store.

---

### sliceMode?

> `optional` **sliceMode**: `"auto"` \| `"slices"` \| `"single"`

Defined in: [packages/core/src/interface.ts:353](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L353)

Control how `createState` should be interpreted.

#### Remarks

- auto: infer from createState shape. Object maps whose values are all
  functions are ambiguous, so prefer setting `sliceMode` explicitly.
- slices: force slices mode.
- single: force single-store mode.

---

### transport?

> `optional` **transport**: `Transport`

Defined in: [packages/core/src/interface.ts:329](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L329)

Inject a pre-built transport for advanced shared-store setups.

---

### transportPolicy?

> `optional` **transportPolicy**: [`TransportPolicy`](TransportPolicy.md)

Defined in: [packages/core/src/interface.ts:331](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L331)

Restrict requests accepted by a shared-main store.

---

### ~~workerType?~~

> `optional` **workerType**: `"SharedWorkerInternal"` \| `"WebWorkerInternal"`

Defined in: [packages/core/src/interface.ts:325](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L325)

#### Deprecated

Internal worker-mode override retained for compatibility.
Prefer passing `transport` or letting the runtime infer the environment.
