[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / MiddlewareStore

# Interface: MiddlewareStore\<T\>

Defined in: [src/interface.ts:164](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L164)

Semantic alias for middleware-facing stores.

## Remarks

Middleware implementations should type their `store` parameter as
`MiddlewareStore` instead of relying on deprecated `patch` or `trace` hooks.

## Extends

- [`Store`](Store.md)\<`T`\>

## Type Parameters

### T

`T` _extends_ [`ISlices`](../type-aliases/ISlices.md) = [`ISlices`](../type-aliases/ISlices.md)

## Properties

### apply()

> **apply**: (`state?`, `patches?`) => `void`

Defined in: [src/interface.ts:132](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L132)

Apply patches to the current state.

#### Parameters

##### state?

`T`

##### patches?

`Patches`

#### Returns

`void`

#### Remarks

This is a low-level hook used by transports and middleware. Application
code should generally prefer store methods or `setState()`.

#### Inherited from

[`Store`](Store.md).[`apply`](Store.md#apply)

---

### destroy()

> **destroy**: () => `void`

Defined in: [src/interface.ts:111](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L111)

Tear down the store.

#### Returns

`void`

#### Remarks

`destroy()` is idempotent. It clears subscriptions and disposes any
attached transport.

#### Inherited from

[`Store`](Store.md).[`destroy`](Store.md#destroy)

---

### getInitialState()

> **getInitialState**: () => `T`

Defined in: [src/interface.ts:144](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L144)

Return the state produced during initialization before later mutations.

#### Returns

`T`

#### Inherited from

[`Store`](Store.md).[`getInitialState`](Store.md#getinitialstate)

---

### getPureState()

> **getPureState**: () => `T`

Defined in: [src/interface.ts:140](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L140)

Return the current state without methods or getters.

#### Returns

`T`

#### Remarks

Useful for serialization, inspection, or tests that only care about raw
data.

#### Inherited from

[`Store`](Store.md).[`getPureState`](Store.md#getpurestate)

---

### getState()

> **getState**: () => `T`

Defined in: [src/interface.ts:97](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L97)

Read the current state object.

#### Returns

`T`

#### Remarks

The returned object includes methods and getters. Methods destructured from
this object continue to execute against the latest store state.

#### Inherited from

[`Store`](Store.md).[`getState`](Store.md#getstate)

---

### isSliceStore

> **isSliceStore**: `boolean`

Defined in: [src/interface.ts:124](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L124)

Whether `createState` was interpreted as a slices object.

#### Inherited from

[`Store`](Store.md).[`isSliceStore`](Store.md#isslicestore)

---

### name

> **name**: `string`

Defined in: [src/interface.ts:69](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L69)

The name of the store.

#### Inherited from

[`Store`](Store.md).[`name`](Store.md#name)

---

### ~~patch()?~~

> `optional` **patch**: (`option`) => [`PatchTransform`](PatchTransform.md)

Defined in: [src/interface.ts:149](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L149)

#### Parameters

##### option

[`PatchTransform`](PatchTransform.md)

#### Returns

[`PatchTransform`](PatchTransform.md)

#### Deprecated

Middleware compatibility hook. Prefer typing middleware stores
with `MiddlewareStore`.

#### Inherited from

[`Store`](Store.md).[`patch`](Store.md#patch)

---

### setState()

> **setState**: (`next`, `updater?`) => `void`

Defined in: [src/interface.ts:78](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L78)

Mutate the current state.

#### Parameters

##### next

The next partial state, or an updater that mutates a draft.

`DeepPartial`\<`T`\> | (`draft`) => `any` | `null`

##### updater?

(`next`) => \[\] \| \[`T`, `Patches`, `Patches`\]

Low-level updater hook used by transports and middleware integrations.

#### Returns

`void`

#### Remarks

Pass a deep-partial object to merge fields, or pass an updater to edit a
Mutative draft. Client-side shared stores intentionally reject direct
`setState()` calls; trigger a store method instead.

#### Inherited from

[`Store`](Store.md).[`setState`](Store.md#setstate)

---

### share?

> `optional` **share**: `false` \| `"main"` \| `"client"`

Defined in: [src/interface.ts:116](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L116)

Indicates whether the store is local, the main shared store, or a client
mirror of a shared store.

#### Inherited from

[`Store`](Store.md).[`share`](Store.md#share)

---

### subscribe()

> **subscribe**: (`listener`) => () => `void`

Defined in: [src/interface.ts:103](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L103)

Subscribe to state changes.

#### Parameters

##### listener

`Listener`

#### Returns

A function that removes the listener.

> (): `void`

##### Returns

`void`

#### Inherited from

[`Store`](Store.md).[`subscribe`](Store.md#subscribe)

---

### ~~trace()?~~

> `optional` **trace**: (`options`) => `void`

Defined in: [src/interface.ts:154](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L154)

#### Parameters

##### options

[`StoreTraceEvent`](StoreTraceEvent.md)

#### Returns

`void`

#### Deprecated

Middleware compatibility hook. Prefer typing middleware stores
with `MiddlewareStore`.

#### Inherited from

[`Store`](Store.md).[`trace`](Store.md#trace)

---

### transport?

> `optional` **transport**: `Transport`\<`any`\>

Defined in: [src/interface.ts:120](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L120)

Transport used to synchronize a shared store between processes or threads.

#### Inherited from

[`Store`](Store.md).[`transport`](Store.md#transport)
